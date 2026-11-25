import asyncio
import json
import unittest
from unittest.mock import patch

import numpy as np

from backend.clustering import cluster_embeddings
from backend.main import app


async def post(payload):
    events = []

    async def receive():
        return {"type": "http.request", "body": json.dumps(payload).encode()}

    async def send(event):
        events.append(event)

    await app({
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
        "method": "POST", "scheme": "http", "path": "/api/cluster",
        "root_path": "", "query_string": b"",
        "headers": [(b"content-type", b"application/json")],
    }, receive, send)
    return events[0]["status"], json.loads(events[1]["body"])


class ClusterTests(unittest.TestCase):
    def test_threshold_and_cosine(self):
        ids = ["a", "b", "single"]
        vectors = np.array([[2, 0], [4, 0.2], [0, 3]])
        self.assertEqual(cluster_embeddings(ids, vectors, 0.2), ([["a", "b"]], ["single"]))
        self.assertEqual(cluster_embeddings(ids, vectors, 1.5), ([ids], []))
        self.assertEqual(cluster_embeddings([], None, 0.65), ([], []))
        self.assertEqual(cluster_embeddings(["a"], None, 0.65), ([], ["a"]))

    def test_api_empty_and_single(self):
        with patch("backend.main.get_embeddings", side_effect=AssertionError("Unexpected inference")):
            for entries in ([], [{"id": "a", "text": "pear"}]):
                status, result = asyncio.run(post({"entries": entries}))
                self.assertEqual(status, 200)
                self.assertEqual(result["processed_count"], len(entries))
                self.assertEqual(result["groups"], [])
                self.assertEqual(result["ungrouped"], [entry["id"] for entry in entries])

    def test_api_validation(self):
        for bad in (
            {"entries": [{"id": "a", "text": " "}]},
            {"entries": [{"id": "a", "text": "pear", "schedule": {}}]},
            {"entries": [{"id": "a", "text": "pear"}] * 2},
            {"entries": [], "distance_threshold": 0},
            {"entries": [{"id": str(index), "text": "pear"} for index in range(501)]},
        ):
            with self.subTest(bad=str(bad)[:80]):
                self.assertEqual(asyncio.run(post(bad))[0], 422)

    def test_api_groups_and_model_failure(self):
        entries = [{"id": str(i), "text": text} for i, text in enumerate(["pear", "apple", "school"])]
        with patch("backend.main.get_embeddings", return_value=np.array([[1, 0], [1, 0], [0, 1]])) as encode:
            status, result = asyncio.run(post({"entries": entries, "distance_threshold": 0.4}))
            self.assertEqual(status, 200)
            self.assertEqual(result["groups"], [["0", "1"]])
            self.assertEqual(result["ungrouped"], ["2"])
            self.assertEqual(result["parameters"]["linkage"], "average")
            encode.assert_called_once_with(["pear", "apple", "school"])
        with patch("backend.main.get_embeddings", side_effect=OSError):
            with self.assertLogs("backend.main", level="ERROR"):
                self.assertEqual(asyncio.run(post({"entries": entries}))[0], 503)
