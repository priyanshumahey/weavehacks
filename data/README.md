# Data

This folder holds the **Game of Thrones Script – All Seasons** dataset.

- Source: https://www.kaggle.com/datasets/albenft/game-of-thrones-script-all-seasons
- Main file: `Game_of_Thrones_Script.csv`

The dataset files are **not committed** (see [.gitignore](.gitignore)). To pull
them locally, run the committed download script from the repo root:

```bash
./scripts/download-data.sh
```

This requires a Kaggle API token. See the header of
[`scripts/download-data.sh`](../scripts/download-data.sh) for setup details.

## Episode synopses

`got_episodes.json` holds a per-episode **Plot synopsis** for all 73 episodes
(8 seasons), scraped from Wikipedia and keyed to the same `season` / `episode`
roster as the script CSV. Each record:

```json
{
  "season": 1, "episode": 1, "title": "Winter is Coming",
  "release_date": "2011-04-17",
  "wiki_title": "Winter Is Coming",
  "wiki_url": "https://en.wikipedia.org/wiki/Winter_Is_Coming",
  "synopsis": "On the continent of Westeros, rangers of the Night's Watch ..."
}
```

It is **not committed** (same `.gitignore` rule). Reproduce it from the repo
root (no credentials needed):

```bash
uv run python scripts/scrape_episodes.py
```

