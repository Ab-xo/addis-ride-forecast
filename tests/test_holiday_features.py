import unittest

import pandas as pd

from src import config, features


class HolidayFeatureTests(unittest.TestCase):
    def setUp(self):
        holiday_hours = pd.date_range("2025-01-07", periods=48, freq="h")
        self.events = pd.DataFrame({
            "event_id": ["holiday"],
            "event_type": ["public_holiday"],
            "zones": [config.ZONES],
            "start": [holiday_hours[0]],
            "end": [holiday_hours[-1]],
            "status": ["confirmed"],
        })
        event_grid = pd.MultiIndex.from_product(
            [config.ZONES, holiday_hours], names=["zone", "pickup_hour"]
        ).to_frame(index=False)
        self.event_hours = event_grid.assign(
            event_id="holiday",
            event_type="public_holiday",
            phase="during",
            attendance=0,
            status="confirmed",
        )
        self.keys = pd.MultiIndex.from_product(
            [config.ZONES, pd.date_range("2025-01-06", "2025-01-10", freq="h")],
            names=["zone", "pickup_hour"],
        ).to_frame(index=False)

    def test_day_after_flag_marks_only_the_day_after_a_multiday_holiday(self):
        result = features.aggregate_event_features(
            self.keys, self.event_hours, self.events
        )

        for zone in config.ZONES:
            for day in pd.date_range("2025-01-07", "2025-01-08", freq="D"):
                holiday_rows = result[
                    (result["zone"] == zone)
                    & result["pickup_hour"].between(day, day + pd.Timedelta(hours=23))
                ]
                self.assertEqual(holiday_rows["is_day_after_public_holiday"].sum(), 0)

            next_day = pd.date_range("2025-01-09", periods=24, freq="h")
            post_holiday_rows = result[
                (result["zone"] == zone) & result["pickup_hour"].isin(next_day)
            ]
            self.assertEqual(post_holiday_rows["is_day_after_public_holiday"].sum(), 24)

    def test_holiday_eve_feature_remains_available(self):
        result = features.aggregate_event_features(
            self.keys, self.event_hours, self.events
        )
        self.assertIn("is_holiday_eve", result.columns)
        self.assertIn("is_day_after_public_holiday", result.columns)
        self.assertIn("is_day_after_public_holiday", features.ALL_FEATURES)

    def test_holiday_period_covers_eve_holiday_and_following_day(self):
        result = features.aggregate_event_features(
            self.keys, self.event_hours, self.events
        )
        eve = result[result["pickup_hour"] == pd.Timestamp("2025-01-06 00:00")]
        holiday = result[(result["pickup_hour"] >= pd.Timestamp("2025-01-07"))
                         & (result["pickup_hour"] <= pd.Timestamp("2025-01-08 23:00"))]
        post = result[result["pickup_hour"] == pd.Timestamp("2025-01-09 00:00")]
        self.assertTrue((eve["is_holiday_period"] == 1).all())
        self.assertTrue((holiday["is_holiday_period"] == 1).all())
        self.assertTrue((post["is_holiday_period"] == 1).all())

    def test_named_holiday_families_are_pooled(self):
        religious = pd.DataFrame({
            "event_id": ["eid"],
            "event_name": ["Eid al-Fitr"],
            "event_type": ["public_holiday"],
            "zones": [config.ZONES],
            "start": [pd.Timestamp("2025-03-31")],
            "end": [pd.Timestamp("2025-03-31 23:59")],
            "status": ["confirmed"],
        })
        hours = pd.MultiIndex.from_product(
            [config.ZONES, pd.date_range("2025-03-31", periods=24, freq="h")],
            names=["zone", "pickup_hour"],
        ).to_frame(index=False)
        event_hours = hours.assign(
            event_id="eid", event_type="public_holiday", phase="during",
            attendance=0, status="confirmed",
        )
        result = features.aggregate_event_features(hours, event_hours, religious)
        self.assertTrue((result["is_religious_holiday"] == 1).all())
        self.assertTrue((result["is_national_holiday"] == 0).all())

    def test_cancelled_holiday_does_not_create_period_or_family_flags(self):
        events = self.events.assign(status="cancelled", event_name="Genna")
        hours = self.event_hours.assign(status="cancelled")
        result = features.aggregate_event_features(self.keys, hours, events)
        holiday_columns = [
            "is_public_holiday", "is_holiday_eve", "is_holiday_period",
            "is_day_after_public_holiday", "is_religious_holiday", "is_national_holiday",
        ]
        self.assertEqual(int(result[holiday_columns].to_numpy().sum()), 0)


if __name__ == "__main__":
    unittest.main()
