#!/usr/bin/env python3
"""Hand-rolled APK builder for the Sky Guardian game.

No Android SDK / aapt2 / Java needed — assembles an APK from the nitron
WebView classes.dex template plus our single-file build:

  AndroidManifest.xml  : binary AXML encoded from scratch in this script
  classes.dex          : /tmp/nitron/package/template/base.apk (WebView shell
                         serving https://appassets.androidplatform.net/<path>
                         out of assets/www/<path>)
  assets/www/index.html: our bundled dist/index.html

Signing: v1 (JAR: MANIFEST.MF / CERT.SF / CERT.RSA) for Android 5–6 and
v2 (APK Signing Block, RSASSA-PKCS1-v1_5 + SHA-256) for Android 7+.
Key/cert are self-generated and cached at ~/.apkkey.pem / ~/.apkcert.pem.
"""
import base64
import datetime
import hashlib
import io
import os
import struct
import subprocess
import sys
import zipfile

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs7
from cryptography.x509.oid import NameOID

PKG = "com.aloarse.arsegame"
APP_LABEL = "آرس"
VERSION_CODE = 13
VERSION_NAME = "6.5"
MIN_SDK = 21
TARGET_SDK = 29  # forgiving: no R+ resources.arsc rules, no edge-to-edge enforcement
SPLASH_BG = "#060A1A"
DEX_PATH = "/tmp/nitron/package/template/base.apk"
HTML_PATH = os.path.join(os.path.dirname(__file__), "..", "dist", "index.html")
KEY_PATH = os.path.expanduser("~/.apkkey.pem")
CERT_PATH = os.path.expanduser("~/.apkcert.pem")

# ---------------------------------------------------------------- AXML ----
# android framework attr resource IDs (public, stable)
A_LABEL = 0x01010001
A_NAME = 0x01010003
A_EXPORTED = 0x01010010
A_CONFIG_CHANGES = 0x0101001F
A_VALUE = 0x01010024
A_MIN_SDK = 0x0101020C
A_TARGET_SDK = 0x01010270
A_VERSION_CODE = 0x0101021B
A_VERSION_NAME = 0x0101021C
A_HW_ACCEL = 0x010102D3
A_CLEARTEXT = 0x01010604

ANDROID_NS = "http://schemas.android.com/apk/res/android"
# data types
T_STRING, T_INT_DEC, T_INT_HEX, T_BOOL = 0x03, 0x10, 0x11, 0x12


class Axml:
    def __init__(self):
        self.strings = []          # pool entries in order
        self.attr_ids = {}         # attr-name string -> resource id (mapped prefix)
        self.chunks = []           # body chunks after pool + resmap

    def s(self, text, attr_id=None):
        if text not in self.strings:
            self.strings.append(text)
        idx = self.strings.index(text)
        if attr_id is not None:
            self.attr_ids[text] = attr_id
        return idx

    def attr(self, name, typ, data, raw=None, ns=True, aid=None):
        # returns 20-byte attribute record
        ns_idx = self.s(ANDROID_NS) if ns else 0xFFFFFFFF
        name_idx = self.s(name, attr_id=aid)
        raw_idx = self.s(raw) if raw is not None else 0xFFFFFFFF
        return struct.pack("<IIIHBBI", ns_idx, name_idx, raw_idx, 8, 0, typ, data) \
            .replace(b"\xff\xff\xff\xff", b"\xff\xff\xff\xff", 1)  # no-op keep

    def start(self, name, attrs, line=1):
        name_idx = self.s(name)
        body = struct.pack("<IIIIHHHHHH", line, 0xFFFFFFFF, 0xFFFFFFFF, name_idx,
                           20, 20, len(attrs), 0, 0, 0)
        for a in attrs:
            body += a
        self.chunks.append(struct.pack("<HHI", 0x0102, 16, 16 + len(body)) + body)

    def end(self, name, line=1):
        name_idx = self.s(name)
        body = struct.pack("<IIII", line, 0xFFFFFFFF, 0xFFFFFFFF, name_idx)
        self.chunks.append(struct.pack("<HHI", 0x0103, 16, 24) + body)

    def build(self):
        # reorder pool: mapped attr-name strings first (resource map is positional
        # over a prefix of the pool)
        mapped = [s_ for s_ in self.strings if s_ in self.attr_ids]
        rest = [s_ for s_ in self.strings if s_ not in self.attr_ids]
        order = mapped + rest
        remap = {s_: i for i, s_ in enumerate(order)}

        # string pool data (UTF-16)
        blob = b""
        offsets = []
        for s_ in order:
            offsets.append(len(blob))
            enc = s_.encode("utf-16-le")
            n = len(s_)
            if n >= 0x8000:
                blob += struct.pack("<H", (n >> 16) | 0x8000) + struct.pack("<H", n & 0xFFFF)
            else:
                blob += struct.pack("<H", n)
            blob += enc + b"\x00\x00"
        blob += b"\x00\x00"  # pool terminator (styling opt)
        blob += b"\x00" * (-len(blob) % 4)  # 4-byte chunk alignment
        strings_start = 28 + 4 * len(order)
        pool_size = strings_start + len(blob)
        pool = struct.pack("<HHIIIIII", 0x0001, 28, pool_size, len(order), 0,
                           0, strings_start, strings_start)  # UTF-16, stylesStart=stringsStart (aapt convention)
        pool += b"".join(struct.pack("<I", o) for o in offsets) + blob

        # resource map chunk
        resmap_ids = [self.attr_ids[s_] for s_ in mapped]
        resmap = struct.pack("<HHI", 0x0180, 8, 8 + 4 * len(resmap_ids))
        resmap += b"".join(struct.pack("<I", i) for i in resmap_ids)

        ns_idx = self.s(ANDROID_NS)
        prefix_idx = self.s("android")
        ns_start = struct.pack("<HHIIIII", 0x0100, 16, 24, 1, 0xFFFFFFFF,
                                prefix_idx, ns_idx)
        ns_end = struct.pack("<HHIIIII", 0x0101, 16, 24, 1, 0xFFFFFFFF,
                              prefix_idx, ns_idx)

        # remap name/ns indices inside chunks: chunks were built with old indices.
        # Easiest correct approach: we never reorder *within* attribute use, so
        # instead rebuild chunk index fields by patching: too fiddly — instead
        # ensure ordering stability by REGENERATING chunks. To keep it simple we
        # instead choose pool layout up-front: mapped strings were added first
        # anyway because attrs are declared before element names in our fixed
        # call order? Not guaranteed -> do a real remap via chunk rebuild below.
        self._remap_chunks(order, remap)

        body = ns_start + b"".join(self.chunks) + ns_end
        total = 8 + len(pool) + len(resmap) + len(body)
        return struct.pack("<HHI", 0x0003, 8, total) + pool + resmap + body

    def _remap_chunks(self, order, remap):
        # chunks reference pool indices; rebuild each chunk with new indices.
        def new_idx(old):
            return remap[self.strings[old]]

        out = []
        for ch in self.chunks:
            ctype, hsize, size = struct.unpack("<HHI", ch[:8])
            if ctype == 0x0102:  # start element
                line, _c, _ns, name = struct.unpack("<IIII", ch[8:24])
                attr_start, attr_size, attr_count = struct.unpack("<HHH", ch[24:30])
                attrs = []
                p = 16 + attr_start  # attrStart is relative to attrExt (chunk off 16)
                for _ in range(attr_count):
                    rec = ch[p:p + 20]
                    ns, nm, raw, vsize, res0, dtype, data = struct.unpack("<IIIHBBI", rec)
                    # raw value index and string data index both need remapping
                    if dtype == T_STRING:
                        data = new_idx(data)
                    if raw != 0xFFFFFFFF:
                        raw = new_idx(raw)
                    if ns != 0xFFFFFFFF:
                        ns = new_idx(ns)
                    nm = new_idx(nm)
                    attrs.append(struct.pack("<IIIHBBI", ns, nm, raw, vsize, res0, dtype, data))
                    p += 20
                body = struct.pack("<IIIIHHHHHH", line, 0xFFFFFFFF, 0xFFFFFFFF,
                                   new_idx(name), attr_start, attr_size, attr_count, 0, 0, 0)
                body += b"".join(attrs)
                out.append(struct.pack("<HHI", 0x0102, 16, 8 + len(body)) + body)
            elif ctype == 0x0103:  # end element
                line, _c, _ns, name = struct.unpack("<IIII", ch[8:24])
                body = struct.pack("<IIII", line, 0xFFFFFFFF, 0xFFFFFFFF, new_idx(name))
                out.append(struct.pack("<HHI", 0x0103, 16, 24) + body)
            else:
                out.append(ch)
        self.chunks = out


def sattr(ax, name, value, aid):
    """string-typed android attribute"""
    return ax.attr(name, T_STRING, ax.s(value), raw=value, ns=True, aid=aid)


def battr(ax, name, value, aid):
    return ax.attr(name, T_BOOL, 0xFFFFFFFF if value else 0, ns=True, aid=aid)


def iattr(ax, name, value, aid, hex_=False):
    return ax.attr(name, T_INT_HEX if hex_ else T_INT_DEC, value, ns=True, aid=aid)


def build_manifest():
    ax = Axml()
    ax.s(ANDROID_NS)
    ax.s("android")

    ax.start("manifest", [
        ax.attr("package", T_STRING, ax.s(PKG), raw=PKG, ns=False),
        iattr(ax, "versionCode", VERSION_CODE, A_VERSION_CODE),
        sattr(ax, "versionName", VERSION_NAME, A_VERSION_NAME),
    ])
    ax.start("uses-sdk", [
        iattr(ax, "minSdkVersion", MIN_SDK, A_MIN_SDK),
        iattr(ax, "targetSdkVersion", TARGET_SDK, A_TARGET_SDK),
    ])
    ax.end("uses-sdk")
    ax.start("uses-permission", [
        sattr(ax, "name", "android.permission.INTERNET", A_NAME),
    ])
    ax.end("uses-permission")

    meta = [
        ("nitron.backButton", "history"),
        ("nitron.clearCacheOnStart", "false"),
        ("nitron.splashBackground", SPLASH_BG),
    ]

    ax.start("application", [
        sattr(ax, "label", APP_LABEL, A_LABEL),
        battr(ax, "hardwareAccelerated", True, A_HW_ACCEL),
        battr(ax, "usesCleartextTraffic", False, A_CLEARTEXT),
    ] + [a for m in meta for a in (
        sattr(ax, "name", m[0], A_NAME), sattr(ax, "value", m[1], A_VALUE))][:0])
    # application-level meta-data (read via ApplicationInfo.metaData)
    for k, v in meta:
        ax.start("meta-data", [sattr(ax, "name", k, A_NAME), sattr(ax, "value", v, A_VALUE)])
        ax.end("meta-data")

    ax.start("activity", [
        sattr(ax, "name", "com.nicron.webview.MainActivity", A_NAME),
        battr(ax, "exported", True, A_EXPORTED),
        iattr(ax, "configChanges", 0x4A0, A_CONFIG_CHANGES, hex_=True),
    ])
    ax.start("intent-filter", [])
    ax.start("action", [sattr(ax, "name", "android.intent.action.MAIN", A_NAME)])
    ax.end("action")
    ax.start("category", [sattr(ax, "name", "android.intent.category.LAUNCHER", A_NAME)])
    ax.end("category")
    ax.end("intent-filter")
    for k, v in meta:  # activity-level copy, as nitron emits
        ax.start("meta-data", [sattr(ax, "name", k, A_NAME), sattr(ax, "value", v, A_VALUE)])
        ax.end("meta-data")
    ax.end("activity")
    ax.end("application")
    ax.end("manifest")
    return ax.build()


# ------------------------------------------------------------- signing ----
def get_key_cert():
    """Signing key: repo .signkey/ first (survives sandbox resets), then the
    home paths. If none exist, generate a fresh self-signed pair and store it
    in BOTH places. NOTE: a fresh pair means Android will refuse an in-place
    update over an older install (signature mismatch) — uninstall first."""
    repo_key = os.path.join(os.path.dirname(__file__), "..", ".signkey")
    os.makedirs(repo_key, exist_ok=True)
    for kp, cp in (
        (os.path.join(repo_key, "apkkey.pem"), os.path.join(repo_key, "apkcert.pem")),
        (KEY_PATH, CERT_PATH),
    ):
        if os.path.exists(kp) and os.path.exists(cp):
            key = serialization.load_pem_private_key(open(kp, "rb").read(), None)
            cert = x509.load_pem_x509_certificate(open(cp, "rb").read())
            return key, cert
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Arse Game")])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=365 * 30))
        .sign(key, hashes.SHA256())
    )
    pem_key = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption())
    pem_cert = cert.public_bytes(serialization.Encoding.PEM)
    for kp, cp in (
        (os.path.join(repo_key, "apkkey.pem"), os.path.join(repo_key, "apkcert.pem")),
        (KEY_PATH, CERT_PATH),
    ):
        try:
            open(kp, "wb").write(pem_key)
            open(cp, "wb").write(pem_cert)
        except OSError:
            pass  # home dir may not be writable
    return key, cert


def sha256(b):
    return hashlib.sha256(b).digest()


def b64(b):
    return base64.b64encode(b).decode()


def v1_sign(zip_buf: bytes, entries, key, cert) -> dict:
    """Return META-INF file contents for JAR (v1) signing.

    entries: list of (name, uncompressed_bytes) in zip order, excluding
    META-INF/*. Digests are over uncompressed content.
    """
    mf = "Manifest-Version: 1.0\r\nCreated-By: 1.0 (Android ArseSigner)\r\n\r\n"
    sections = {}
    for name, data in entries:
        sec = f"Name: {name}\r\nSHA-256-Digest: {b64(sha256(data))}\r\n"
        sections[name] = sec.encode()
        mf += sec + "\r\n"
    mf_bytes = mf.encode()

    sf = ("Signature-Version: 1.0\r\nCreated-By: 1.0 (Android ArseSigner)\r\n"
          f"SHA-256-Digest-Manifest: {b64(sha256(mf_bytes))}\r\n\r\n")
    for name, _ in entries:
        sf += sections[name].decode() + "\r\n"
    sf_bytes = sf.encode()

    p7 = (
        pkcs7.PKCS7SignatureBuilder()
        .set_data(sf_bytes)
        .add_signer(cert, key, hashes.SHA256())
        .sign(
            serialization.Encoding.DER,
            [pkcs7.PKCS7Options.DetachedSignature, pkcs7.PKCS7Options.Binary],
        )
    )
    return {
        "META-INF/MANIFEST.MF": mf_bytes,
        "META-INF/CERT.SF": sf_bytes,
        "META-INF/CERT.RSA": p7,
    }


def lp(data: bytes) -> bytes:
    """u32 length prefix"""
    return struct.pack("<I", len(data)) + data


def v2_block(apk_without_block: bytes, key, cert) -> bytes:
    """APK Signing Block with scheme v2 (RSA PKCS1-v1_5 SHA-256, alg 0x0103)."""
    # locate central directory via EOCD
    eocd_off = apk_without_block.rfind(b"PK\x05\x06")
    assert eocd_off != -1
    cd_size, cd_off = struct.unpack("<II", apk_without_block[eocd_off + 12:eocd_off + 20])
    assert cd_off + cd_size == eocd_off

    # chunked digests: contents, central directory, and EOCD are chunked as
    # SEPARATE regions (each restarts the 1MB chunking)
    chunks = []
    for start, end in ((0, cd_off), (cd_off, eocd_off), (eocd_off, len(apk_without_block))):
        pos = start
        while pos < end:
            chunks.append(apk_without_block[pos:min(pos + 1048576, end)])
            pos += 1048576
    digests = b"".join(
        sha256(b"\xa5" + struct.pack("<I", len(c)) + c) for c in chunks)
    top_digest = sha256(b"\x5a" + struct.pack("<I", len(chunks)) + digests)

    cert_der = cert.public_bytes(serialization.Encoding.DER)
    pubkey_der = key.public_key().public_bytes(
        serialization.Encoding.DER,
        serialization.PublicFormat.SubjectPublicKeyInfo)

    # signed data: digests seq + certificates seq + attributes seq
    digest_record = lp(struct.pack("<I", 0x0103) + lp(top_digest))  # 0x0103 = RSASSA-PKCS1-v1_5 + SHA-256
    signed_data = (
        lp(digest_record) +
        lp(lp(cert_der)) +
        lp(b"")
    )
    from cryptography.hazmat.primitives.asymmetric import padding
    sig = key.sign(signed_data, padding.PKCS1v15(), hashes.SHA256())
    signatures = lp(struct.pack("<I", 0x0103) + lp(sig))
    signer = lp(signed_data) + lp(signatures) + lp(pubkey_der)
    # value = signers SEQUENCE: its content is the length-prefixed signer RECORD
    value = lp(lp(signer))

    pairs = struct.pack("<Q", 4 + len(value)) + struct.pack("<I", 0x7109871A) + value
    block_size = len(pairs) + 8 + 16  # + trailing size field + magic
    block = (struct.pack("<Q", block_size) + pairs +
             struct.pack("<Q", block_size) + b"APK Sig Block 42")
    return block


def load_template_dex():
    """classes.dex from the nitron WebView shell template.

    Sources, in order: /tmp nitron template zip, then the raw copy committed
    at scripts/nitron-classes.dex (survives sandbox resets).
    A previous build accidentally embedded the whole base.apk zip as
    classes.dex -> 'App not installed' on device. Guard with magic checks.
    """
    if os.path.exists(DEX_PATH):
        with zipfile.ZipFile(DEX_PATH) as z:
            dex = z.read("classes.dex")
    else:
        repo_dex = os.path.join(os.path.dirname(__file__), "nitron-classes.dex")
        dex = open(repo_dex, "rb").read()
    assert dex[:4] == b"dex\n", f"template classes.dex is not a dex: {dex[:8]!r}"
    import zlib
    hdr = struct.unpack("<II", dex[32:40])
    assert hdr[0] == len(dex), "dex size field mismatch"
    assert (zlib.adler32(dex[12:]) & 0xFFFFFFFF) == struct.unpack("<I", dex[8:12])[0], "dex adler mismatch"
    return dex


def build_apk(out_path):
    key, cert = get_key_cert()
    manifest = build_manifest()
    dex = load_template_dex()
    html = open(HTML_PATH, "rb").read()

    entries = [
        ("AndroidManifest.xml", manifest),
        ("assets/www/index.html", html),
        ("classes.dex", dex),
    ]
    v1_files = v1_sign(None, entries, key, cert)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        def put(name, data):
            zi = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
            zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = 0o100644 << 16
            z.writestr(zi, data)
        for name, data in entries:
            put(name, data)
        for name, data in v1_files.items():
            put(name, data)
    apk = bytearray(buf.getvalue())

    # insert v2 block before central directory, patch EOCD (which moved!)
    eocd_off = apk.rfind(b"PK\x05\x06")
    cd_off = struct.unpack("<I", apk[eocd_off + 16:eocd_off + 20])[0]
    block = v2_block(bytes(apk), key, cert)
    apk[cd_off:cd_off] = block
    new_cd_off = cd_off + len(block)
    struct.pack_into("<I", apk, eocd_off + len(block) + 16, new_cd_off)

    open(out_path, "wb").write(apk)
    return out_path, len(apk)


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "dist/arse-game.apk"
    repo_dex = os.path.join(os.path.dirname(__file__), "nitron-classes.dex")
    if not os.path.exists(DEX_PATH) and not os.path.exists(repo_dex):
        subprocess.run(["mkdir", "-p", "/tmp/nitron"], check=True)
        print("!! template dex missing — re-fetch nitron tarball first", file=sys.stderr)
        sys.exit(1)
    path, size = build_apk(out)
    print(f"OK {path} {size:,} bytes")
