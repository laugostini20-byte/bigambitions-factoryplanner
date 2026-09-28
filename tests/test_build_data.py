import json, pathlib, sys, unittest
ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_data

class BuildDataTest(unittest.TestCase):
    def setUp(self):
        self.data = build_data.build(ROOT / "data/BigAmbitions_Items_and_Prices.xlsx")
        self.orig = json.loads((ROOT / "tests/fixtures/original-data.json").read_text())

    def test_recipes_match_original(self):
        self.assertEqual(self.data["R"], self.orig["R"])

    def test_items_match_original(self):
        self.assertEqual(self.data["I"], self.orig["I"])

    def test_machines_match_original(self):
        self.assertEqual(self.data["M"], self.orig["M"])

    def test_meta(self):
        self.assertEqual(self.data["meta"]["pulled"], "2026-09-27")

if __name__ == "__main__":
    unittest.main()
