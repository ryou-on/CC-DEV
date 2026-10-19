"""取得URL・書き出しパス・レビューゲートの回帰テスト。ネットワークとブラウザは使わない。"""
import json, pathlib, sys, tempfile, unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import extract  # noqa: E402
import render  # noqa: E402


class SafeSlugTest(unittest.TestCase):
    def test_normal(self):
        self.assertEqual(extract.safe_slug("kdc"), "kdc")
        self.assertEqual(extract.safe_slug("My Clinic"), "my-clinic")

    def test_rejects_traversal(self):
        self.assertEqual(extract.safe_slug("../../etc/passwd"), "etc-passwd")
        for raw in ("..", ".", "---", "", "   "):
            with self.assertRaises(SystemExit):
                extract.safe_slug(raw)


class UrlPolicyTest(unittest.TestCase):
    def test_rejects_non_http_and_internal(self):
        for url in (
            "file:///etc/passwd",
            "javascript:alert(1)",
            "http://127.0.0.1/x",
            "http://localhost/x",
            "http://169.254.169.254/latest/meta-data",
            "http://[::1]/",
            "http://10.1.2.3/",
            "https://user:pass@example.com/",
            "http://2130706433/",
        ):
            with self.subTest(url=url):
                with self.assertRaises(SystemExit):
                    extract.validate_public_http_url(url)

    def test_allows_public_https_without_dns(self):
        p = extract.validate_public_http_url("https://k-dc.net/path", resolve_dns=False)
        self.assertEqual(p.hostname, "k-dc.net")


class RenderGuardTest(unittest.TestCase):
    def test_review_gate_on_real_brands(self):
        brands = ROOT / "brands"
        kdc = json.loads((brands / "kdc" / "brand.json").read_text(encoding="utf8"))
        hihaho = json.loads((brands / "hihaho" / "brand.json").read_text(encoding="utf8"))
        syl = json.loads((brands / "sylavids" / "brand.json").read_text(encoding="utf8"))
        render.assert_render_allowed(kdc, force=False)
        render.assert_render_allowed(hihaho, force=False)
        with self.assertRaises(SystemExit):
            render.assert_render_allowed(syl, force=False)
        render.assert_render_allowed(syl, force=True)
        render.assert_brand_shape(kdc, [15, 30])

    def test_logo_path_stays_inside_brand_dir(self):
        with tempfile.TemporaryDirectory() as d:
            base = pathlib.Path(d)
            (base / "full.png").write_bytes(b"png")
            outside = base.parent / "secret.png"
            outside.write_bytes(b"nope")
            link = base / "link.png"
            link.symlink_to(outside)
            self.assertEqual(render.resolve_inside(base, "full.png"), (base / "full.png").resolve())
            for rel in ("../secret.png", "/etc/passwd", "link.png", "..\\full.png"):
                with self.subTest(rel=rel):
                    with self.assertRaises(SystemExit):
                        render.resolve_inside(base, rel)
            outside.unlink(missing_ok=True)

    def test_output_stem_cannot_escape(self):
        self.assertEqual(render.output_stem("../../tmp/pwned"), "tmp-pwned")
        self.assertEqual(render.output_stem(""), "cm")
        self.assertEqual(render.output_stem("kdc"), "kdc")

    def test_duration_and_orient(self):
        self.assertEqual(render.parse_durations("15,30"), [15, 30])
        self.assertEqual(render.parse_orients("h,v"), ["h", "v"])
        for raw in ("0", "121", "15s", ""):
            with self.assertRaises(SystemExit):
                render.parse_durations(raw)
        with self.assertRaises(SystemExit):
            render.parse_orients("x")


if __name__ == "__main__":
    unittest.main()
