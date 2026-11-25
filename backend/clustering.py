from collections import defaultdict

import numpy as np
from sklearn.cluster import AgglomerativeClustering
from sklearn.metrics.pairwise import cosine_similarity


def cluster_embeddings(ids: list[str], vectors, distance_threshold: float):
    if len(ids) < 2:
        return [], ids
    similarities = cosine_similarity(vectors)
    distances = np.clip(1 - similarities, 0, 2)
    np.fill_diagonal(distances, 0)
    labels = AgglomerativeClustering(
        n_clusters=None, distance_threshold=distance_threshold,
        metric="precomputed", linkage="average",
    ).fit_predict(distances)
    groups = defaultdict(list)
    for word_id, label in zip(ids, labels, strict=True):
        groups[label].append(word_id)
    return (
        [group for group in groups.values() if len(group) > 1],
        [group[0] for group in groups.values() if len(group) == 1],
    )
