# HoyoLAB Wiki Scraper

HoyoLAB Wiki Scraper is a server plugin for SillyTavern that scrapes the HoyoLAB wiki and exports it as JSON documents.

> [!NOTE]
> Currently, the only parser that works is the Honkai: Star Rail HoYoLAB parser. Genshin support coming soon.

## How to install

1. Before you begin, make sure you set a config `enableServerPlugins` to `true` in the config.yaml file of SillyTavern.

2. Open a terminal in your SillyTavern directory, then run the following:

```bash
cd plugins
git clone https://github.com/Bronya-Rand/HoYoWiki-Scraper-TS
```

<!-- 3. Restart the SillyTavern server. Then choose "Selenium Plugin" as a source in the Web Search extension UI. -->

## How to build

Clone the repository, then run `npm install`.

```bash
# Debug build
npm run build:dev
# Prod build
npm run build
```

## License

AGPLv3
