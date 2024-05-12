# HoyoLAB Wiki Scraper

HoYoLAB Wiki Scraper is a server plugin for SillyTavern that scrapes the miHoYo/HoYoverse HoYoLAB wiki and exports it as JSON documents.

> Both Genshin Impact and Honkai: Star Rail wikis are supported.

## How to install

1. Before you begin, make sure you set a config `enableServerPlugins` to `true` in the config.yaml file of SillyTavern.

2. Open a terminal in your SillyTavern directory, then run the following:

```bash
cd plugins
git clone https://github.com/Bronya-Rand/HoYoWiki-Scraper-TS
```

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
