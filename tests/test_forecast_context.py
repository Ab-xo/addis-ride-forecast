import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))

import app as forecast_app


class ForecastContextTests(unittest.TestCase):
    def test_weather_context_uses_model_input_and_events_match_selected_zone(self):
        arat_kilo = forecast_app.forecast("Arat Kilo", "2025-11-09")
        chips = arat_kilo["lookup"]["chips"]
        chip_text = [chip["text"] for chip in chips]

        self.assertTrue(all(hour["rain_mm"] == 0 for hour in arat_kilo["hours"]))
        self.assertIn("0.0 mm rain forecast (dry)", chip_text)
        self.assertFalse(arat_kilo["events"])
        self.assertFalse(any("City calendar (Kazanchis)" in text for text in chip_text))
        self.assertTrue(any("No confirmed events listed for Arat Kilo" in text for text in chip_text))

        kazanchis = forecast_app.forecast("Kazanchis", "2025-11-09")
        self.assertTrue(kazanchis["events"])
        self.assertTrue(any(chip["kind"] == "event" for chip in kazanchis["lookup"]["chips"]))


if __name__ == "__main__":
    unittest.main()
