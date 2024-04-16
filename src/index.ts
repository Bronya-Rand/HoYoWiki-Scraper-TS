import { Router } from "express";
import { Chalk } from "chalk";
import { JSDOM } from "jsdom";
import bodyParser from "body-parser";
import createDOMPurify from "dompurify";

// Constants
const MODULE_NAME = "HoYoWiki-Scraper-TS";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
// Even though the HoYoWiki is on wiki.hoyolab.com, the actual JSON is on an API.
const HOYOLAB_URL = "https://sg-wiki-api-static.hoyolab.com/hoyowiki";

const validWikis = ["genshin", "hsr"];

const chalk = new Chalk();
const DOMPurify = createDOMPurify(new JSDOM().window);

// Interfaces
interface PluginInfo {
  id: string;
  name: string;
  description: string;
}

interface Plugin {
  init: (router: Router) => Promise<void>;
  exit: () => Promise<void>;
  info: PluginInfo;
}

interface HoYoLabPageRequest {
  wiki: string;
  wikiId: number;
}

interface HoYoLabAPIJSON {
  retcode: number;
  message: string;
  data: { page: HoYoLabRealJSON };
}

interface HoYoLabRealJSON {
  id: number;
  name: string;
  desc: string;
  icon_url: string;
  header_img_url: string;
  modules: HoYoLabModule[];
  filter_values: HoYoLabFilterValue;
  menu_id: number;
  menu_name: string;
  version: number;
  langs: string[];
  template_layout: string | null;
  edit_lock_status: string;
  correct_lock_status: string;
  menus: string[];
  template_id: string;
  ext: HoYoLabExtDict[];
  alias_name: string;
  lang: string;
  beta: boolean;
}

// Handles that nested JSON data that HoYoLAB uses for some reason.
interface HoYoLABNestedJSON {
  list: [{ key: string; value: [string]; id: string }];
}

interface HoYoLabComponent {
  component_id: string;
  layout: string;
  data: string; // This is actually a JSON string.
  style: string;
}

interface HoYoLabModule {
  name: string;
  is_poped: boolean;
  components: HoYoLabComponent[];
  id: string;
  is_customize_name: boolean;
  is_abstract: boolean;
  is_show_switch: boolean;
  switch: boolean;
  desc: string;
  repeated: boolean;
  is_submodule: boolean;
  origin_module_id: string;
}

interface HoYoLabCharacterValues {
  values: string[];
  value_types: { id: string; value: HoYoLABNestedJSON }[];
}

interface HoYoLabFilterValue {
  character_paths: HoYoLabCharacterValues[];
  character_factions: HoYoLabCharacterValues[];
  character_rarity: HoYoLabCharacterValues[];
  character_combat_type: HoYoLabCharacterValues[];
}

interface HoYoLabExtDict {
  fe_ext: string;
  post_ext: string | null;
}

// Text File Interfaces
interface HoYoLabTextFile {
  title: string;
  content: string;
}

interface HoYoLabTextJSONContents {
  type: string;
  description: string;
  modules: { module: string; moduleData: HoYoLABNestedJSON }[];
  path: string;
  faction: string;
  rarity: string;
  combatType: string;
}

// Functions
function extractTextFromHTML(html: string): string {
  const cleanHTML = DOMPurify.sanitize(html) as string;
  const dom = new JSDOM(cleanHTML);
  return dom.window.document.body.textContent || "";
}

function isValidHoYoWiki(request: HoYoLabPageRequest): boolean {
  return validWikis.includes(request.wiki);
}

function HoYoAPItoPlainText(jsonData: HoYoLabRealJSON): HoYoLabTextFile {
  const secondaryJSONInModuleList: {
    module: string;
    moduleData: HoYoLABNestedJSON;
  }[] = [];
  for (const module of jsonData.modules) {
    const moduleData = JSON.parse(
      module.components[0].data
    ) as HoYoLABNestedJSON;
    for (const moduleDataEntry of moduleData.list) {
      moduleDataEntry.value[0] = extractTextFromHTML(moduleDataEntry.value[0]);
    }
    secondaryJSONInModuleList.push({ module: module.name, moduleData });
  }

  const fixedHoYoLabData = {} as HoYoLabTextFile;
  const textJSONData = {} as HoYoLabTextJSONContents;

  fixedHoYoLabData.title = `Name: ${jsonData.name}`;
  textJSONData.type = `Type: ${jsonData.menu_name}`;
  textJSONData.description = `Description: ${jsonData.desc}`;
  textJSONData.path = `Path: Path of ${jsonData.filter_values.character_paths[0].values[0]}`;
  textJSONData.faction = `Faction: ${jsonData.filter_values.character_factions[0].values[0]}`;
  textJSONData.rarity = `Rarity: ${jsonData.filter_values.character_rarity[0].values[0]}`;
  textJSONData.combatType = `Combat Type: ${jsonData.filter_values.character_combat_type[0].values[0]}`;

  for (const module of secondaryJSONInModuleList) {
    const moduleObject = {
      module: module.module,
      moduleData: module.moduleData,
    };
    textJSONData.modules.push(moduleObject);
  }

  fixedHoYoLabData.content = JSON.stringify(textJSONData, null, 4);

  return fixedHoYoLabData;
}

async function scrapeHoYoLabWiki(
  url: string,
  wiki: string
): Promise<[HoYoLabTextFile]> {
  const headers = {
    "User-Agent": USER_AGENT,
    "Accept-Language": "en-US,en;q=0.6",
    "X-Rpc-Language": "en-US",
    "X-Rpc-Wiki_app": wiki,
  };

  console.log(
    chalk.green(`[${MODULE_NAME}] Fetching the HoYoLAB Wiki Page from the API`)
  );
  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch the HoYoLAB Wiki page: ${response.statusText}`
    );
  }

  const responseJSON = (await response.json()) as HoYoLabAPIJSON;
  // Because HoYo nests data for some reason, we need to get the actual JSON data.
  const realJSONData = responseJSON.data.page;

  const plainTextData = HoYoAPItoPlainText(realJSONData);

  return [plainTextData];
}

// Exports
export async function init(router: Router): Promise<void> {
  const jsonParser = bodyParser.json();

  router.post("/probe", (_req, res) => {
    return res.sendStatus(204);
  });

  router.post("/silver-wolf", jsonParser, async (req, res) => {
    try {
      const request: HoYoLabPageRequest = req.body;

      if (!isValidHoYoWiki(request)) {
        console.error(
          chalk.red(`[${MODULE_NAME}] Scrape Failed! Invalid Wiki Request!`)
        );
        return res.status(400).json({ error: "Invalid Wiki Request" });
      }

      const wikiName = "Genshin" ? request.wiki : "Honkai: Star Rail";
      console.log(
        chalk.green(
          `[${MODULE_NAME}] Scraping the HoYoLAB ${wikiName} Wiki for Wiki ID: ${request.wikiId}`
        )
      );

      const fullHoYoLabURL = `${HOYOLAB_URL}${request.wiki}/wapi/entry_page?entry_page_id=${request.wikiId}`;

      const response = await scrapeHoYoLabWiki(fullHoYoLabURL, request.wiki);
      console.log(
        chalk.green(
          `[${MODULE_NAME}] Scrape Successful for Wiki ID: ${request.wikiId} in the ${wikiName} Wiki`
        )
      );

      return res.json(response);
    } catch (error) {
      console.error(
        chalk.red(`[${MODULE_NAME}] Scrape Failed! Error: ${error}`)
      );
      return res.status(500).json({ error: "Internal Server Error" });
    }
  });

  console.log(
    chalk.green(`[${MODULE_NAME}] Initialized the HoYoWiki Scraper Plugin`)
  );
}

export async function exit(): Promise<void> {
  console.log(
    chalk.green(`[${MODULE_NAME}] Exiting the HoYoWiki Scraper Plugin`)
  );
}

export const info: PluginInfo = {
  id: "hoyoverse",
  name: "HoYoLAB Wiki Scraper",
  description:
    "Scrapes the HoYoLAB Wiki for miHoYo/HoYoverse's Genshin Impact and Honkai: Star Rail.",
};

// Setup
const plugin: Plugin = {
  init,
  exit,
  info,
};

export default plugin;
