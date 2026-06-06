# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "marimo",
#     "pandas",
#     "altair",
#     "pyarrow",
# ]
# ///

import marimo

__generated_with = "0.23.9"
app = marimo.App(width="medium")


@app.cell(hide_code=True)
def _():
    import marimo as mo
    import pandas as pd
    import altair as alt
    from pathlib import Path

    alt.data_transformers.disable_max_rows()
    RED = "#7b1113"
    return Path, RED, alt, mo, pd


@app.cell(hide_code=True)
def _(Path, pd):
    CSV = Path(__file__).parent.parent / "data" / "Game_of_Thrones_Script.csv"

    GENERIC = {
        "man", "woman", "men", "women", "boy", "girl", "guard", "soldier",
        "all", "both", "crowd", "voice", "servant", "maester", "child",
    }

    df = pd.read_csv(CSV)
    for _c in ["Season", "Episode", "Episode Title", "Name"]:
        df[_c] = df[_c].astype(str).str.strip()

    df["season_num"] = df["Season"].str.extract(r"(\d+)").astype(int)
    df["episode_num"] = df["Episode"].str.extract(r"(\d+)").astype(int)
    df["word_count"] = df["Sentence"].astype(str).str.split().str.len()
    df["is_generic"] = df["Name"].str.lower().isin(GENERIC)
    return (df,)


@app.cell(hide_code=True)
def _(mo):
    mo.md("""
    # Game of Thrones
    """)
    return


@app.cell(hide_code=True)
def _(df, mo):
    seasons = sorted(df["season_num"].unique())
    season_filter = mo.ui.multiselect(
        options=seasons, value=seasons, label="Seasons"
    )
    min_words = mo.ui.slider(0, 50, value=0, label="Min words / line", show_value=True)
    top_n = mo.ui.slider(5, 30, value=15, label="Top N characters", show_value=True)
    drop_generic = mo.ui.switch(value=True, label="Hide generic speakers")

    controls = mo.hstack(
        [season_filter, min_words, top_n, drop_generic],
        justify="start", gap=2, wrap=True,
    )
    controls
    return drop_generic, min_words, season_filter, top_n


@app.cell(hide_code=True)
def _(df, drop_generic, min_words, season_filter):
    fdf = df[
        df["season_num"].isin(season_filter.value)
        & (df["word_count"] >= min_words.value)
    ]
    if drop_generic.value:
        fdf = fdf[~fdf["is_generic"]]
    return (fdf,)


@app.cell(hide_code=True)
def _(fdf, mo):
    mo.hstack(
        [
            mo.stat(f"{fdf['episode_num'].groupby(fdf['season_num']).nunique().sum()}", label="Episodes"),
            mo.stat(f"{len(fdf):,}", label="Dialogue lines"),
            mo.stat(f"{fdf['Name'].nunique():,}", label="Speakers"),
            mo.stat(f"{int(fdf['word_count'].sum()):,}", label="Words"),
            mo.stat(f"{fdf['word_count'].mean():.1f}", label="Avg words / line"),
        ],
        justify="space-around", gap=1,
    )
    return


@app.cell(hide_code=True)
def _(RED, alt, fdf, mo, top_n):
    _counts = (
        fdf["Name"].value_counts().head(top_n.value)
        .rename_axis("Character").reset_index(name="Lines")
    )
    _chart = (
        alt.Chart(_counts)
        .mark_bar(color=RED)
        .encode(
            x=alt.X("Lines:Q", title="Dialogue lines"),
            y=alt.Y("Character:N", sort="-x", title=None),
            tooltip=["Character", "Lines"],
        )
        .properties(height=alt.Step(22), title="Most talkative characters")
    )
    mo.ui.altair_chart(_chart)
    return


@app.cell(hide_code=True)
def _(RED, alt, fdf, mo):
    _per_season = (
        fdf.groupby("season_num")
        .agg(lines=("Sentence", "size"), words=("word_count", "sum"))
        .reset_index()
    )
    _chart = (
        alt.Chart(_per_season)
        .mark_area(line={"color": RED}, opacity=0.5, color=RED)
        .encode(
            x=alt.X("season_num:O", title="Season"),
            y=alt.Y("lines:Q", title="Dialogue lines"),
            tooltip=["season_num", "lines", "words"],
        )
        .properties(height=240, width="container", title="Dialogue volume by season")
    )
    mo.ui.altair_chart(_chart)
    return


@app.cell(hide_code=True)
def _(alt, fdf, mo):
    _heat = fdf.groupby(["season_num", "episode_num"]).size().reset_index(name="lines")
    _chart = (
        alt.Chart(_heat)
        .mark_rect()
        .encode(
            x=alt.X("episode_num:O", title="Episode"),
            y=alt.Y("season_num:O", title="Season"),
            color=alt.Color("lines:Q", scale=alt.Scale(scheme="reds"), title="Lines"),
            tooltip=["season_num", "episode_num", "lines"],
        )
        .properties(height=240, width="container", title="Lines per episode")
    )
    mo.ui.altair_chart(_chart)
    return


@app.cell(hide_code=True)
def _(RED, alt, fdf, mo):
    _chart = (
        alt.Chart(fdf)
        .mark_bar(color=RED, opacity=0.8)
        .encode(
            x=alt.X("word_count:Q", bin=alt.Bin(maxbins=40), title="Words per line"),
            y=alt.Y("count():Q", title="Lines"),
        )
        .properties(height=220, width="container", title="Line-length distribution")
    )
    mo.ui.altair_chart(_chart)
    return


@app.cell(hide_code=True)
def _(fdf, mo):
    _opts = fdf["Name"].value_counts().head(50).index.tolist()
    character = mo.ui.dropdown(
        options=_opts, value=_opts[0] if _opts else None, label="Spotlight character"
    )
    character
    return (character,)


@app.cell(hide_code=True)
def _(RED, alt, character, fdf, mo):
    _sub = fdf[fdf["Name"] == character.value]
    _trend = _sub.groupby("season_num").size().reset_index(name="lines")
    _chart = (
        alt.Chart(_trend)
        .mark_line(point=True, color=RED)
        .encode(
            x=alt.X("season_num:O", title="Season"),
            y=alt.Y("lines:Q", title="Lines"),
            tooltip=["season_num", "lines"],
        )
        .properties(height=220, width="container")
    )
    _stats = mo.hstack(
        [
            mo.stat(f"{len(_sub):,}", label="Lines"),
            mo.stat(f"{int(_sub['word_count'].sum()):,}", label="Words"),
            mo.stat(f"{_sub['word_count'].mean():.1f}", label="Avg words / line"),
            mo.stat(f"{_sub['season_num'].nunique()}", label="Seasons active"),
        ],
        justify="space-around", gap=1,
    )
    mo.vstack([mo.md(f"### {character.value.title()}"), _stats, mo.ui.altair_chart(_chart)])
    return


@app.cell(hide_code=True)
def _(fdf, mo):
    mo.vstack(
        [
            mo.md("### Browse the dialogue"),
            mo.ui.table(
                fdf[["Season", "Episode", "Episode Title", "Name", "Sentence"]]
                .reset_index(drop=True),
                page_size=15,
            ),
        ]
    )
    return


if __name__ == "__main__":
    app.run()
