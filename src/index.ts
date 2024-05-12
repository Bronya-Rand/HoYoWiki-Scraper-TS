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
const STAR_RAIL_SWITCH_MAP = {
  Characters: newCreateCharacterJSON,
  Adventure: createGenericJSON,
  Aeons: createAeonsJSON,
  Blessings: createAeonsJSON,
  Curios: createAeonsJSON,
  Enemies: createAeonsJSON,
  Factions: createAeonsJSON,
  "Forgotten Hall": createAeonsJSON,
  "Inventory Items": createAeonsJSON,
  "Light Cones": createAeonsJSON,
  "Map Collections": createAeonsJSON,
  NPCs: createAeonsJSON,
  Path: createAeonsJSON,
  "Permanent Events": createAeonsJSON,
  Phonograph: createAeonsJSON,
  "Pure Fiction": createAeonsJSON,
  Readables: createAeonsJSON,
  "Regular Challenges": createAeonsJSON,
  Relics: createAeonsJSON,
  "Simulated Universe": createAeonsJSON,
  System: createAeonsJSON,
  Terms: createAeonsJSON,
  "Time-Limited Events": createAeonsJSON,
};
const GENSHIN_SWITCH_MAP = {
  "Character Archive": newCreateCharacterJSON,
  "Action Cards": createAeonsJSON,
  Affiliations: createAeonsJSON,
  Artifacts: createAeonsJSON,
  Books: createAeonsJSON,
  "Character Cards": createAeonsJSON,
  Definitions: createAeonsJSON,
  "Enemies and Monsters": createAeonsJSON,
  "Enemy and Monster Cards": createAeonsJSON,
  Nations: createAeonsJSON,
  "NPC Archive": createAeonsJSON,
  "Teyvat's Resources": createAeonsJSON,
  Tutorial: createGenericJSON,
  Weapons: createAeonsJSON,
  Wildlife: createAeonsJSON,
};

type HonkaiStarRail = typeof STAR_RAIL_SWITCH_MAP;
type GenshinImpact = typeof GENSHIN_SWITCH_MAP;

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
  miHoYoWiki: string;
  miHoYoWikiID: number;
}

interface HoYoLabAPIJSON {
  retcode: number;
  message: string;
  data: {
    page: {
      name: string;
      menu_name: string;
    };
  };
}

interface HoYoLabRealGenericJSON {
  id: number;
  name: string;
  desc: string;
  modules: [HoYoLabModule];
  menu_name: string;
}

interface HoYoLabRealCharacterJSON extends HoYoLabRealGenericJSON {}

interface HoYoLabGenericNestedJSON {
  list?: any[];
  data?: string;
}

interface HoYoLabComponent {
  component_id: string;
  layout: string;
  data: string; // This is actually a JSON string.
  style: string;
}

interface HoYoLabModule {
  name: string;
  components: [HoYoLabComponent];
}

interface HoYoLabTextFile {
  type: string;
  name: string;
  content: HoYoLabTextCharacterJSON | HoYoLabTextGenericJSON;
}

interface HoYoLabTextGenericJSON {
  description: string;
  modules?: any[];
}

interface HoYoLabTextCharacterJSON extends HoYoLabTextGenericJSON {}

// Functions
function extractTextFromHTML(html: string | string[]): string {
  let cleanHTML: string;

  if (Array.isArray(html)) {
    // We only want to clean out the individual strings in the array.
    cleanHTML = DOMPurify.sanitize(
      html[0].replace(/<\/p><p>/g, " ").replace(/<\/?(p|strong)>/g, "")
    ).trim();
  } else {
    cleanHTML = DOMPurify.sanitize(
      html.replace(/<\/p><p>/g, " ").replace(/<\/?(p|strong)>/g, " ")
    ) as string;
  }

  const dom = new JSDOM(cleanHTML);
  return dom.window.document.body.textContent || "";
}

function isValidHoYoWiki(request: HoYoLabPageRequest): boolean {
  return validWikis.includes(request.miHoYoWiki);
}

function parseModule(module: HoYoLabModule): any[] | null {
  if (module.name === "" || module.components[0].data === "") {
    console.log(
      chalk.yellow(
        `[${MODULE_NAME}] Empty Module detected. Assuming no data is present`
      )
    );
    return null;
  }

  console.log(chalk.magenta(`Parsing Module: ${module.name}`));

  const parsedData = JSON.parse(
    module.components[0].data
  ) as HoYoLabGenericNestedJSON;
  const moduleData = { name: module.name, data: [] as any[] };

  if (!parsedData.hasOwnProperty("list")) {
    if (!parsedData.hasOwnProperty("data")) {
      console.log(
        chalk.yellow(
          `[${MODULE_NAME}] Module [${module.name}] seems to not have a 'data' field. Skipping...`
        )
      );
      return null;
    }

    moduleData.data.push({
      key: "",
      value: extractTextFromHTML(parsedData.data as string),
    });

    return [moduleData];
  }

  for (const data of parsedData.list ?? [{ key: "", value: [""] }]) {
    if (data.hasOwnProperty("value")) {
      moduleData.data.push({
        key: data.key,
        value: extractTextFromHTML(data.value),
      });
    } else if (data.hasOwnProperty("title") && data.hasOwnProperty("desc")) {
      moduleData.data.push({
        key: data.title,
        value: extractTextFromHTML(data.desc),
      });
      // For Voice-Over/Story Data
    } else if (data.hasOwnProperty("key") && data.hasOwnProperty("values")) {
      moduleData.data.push({
        key: data.key,
        value: extractTextFromHTML(data.values),
      });
      // For Eidolon Data
    } else if (data.hasOwnProperty("name") && data.hasOwnProperty("desc")) {
      moduleData.data.push({
        key: data.name,
        value: extractTextFromHTML(data.desc),
      });
    } else {
      console.log(
        chalk.yellow(
          `[${MODULE_NAME}] Module [${module.name}] seems to not be important for parsing. Skipping...`
        )
      );
      continue;
    }
  }

  return [moduleData];
}

function createGenericJSON(jsonData: HoYoLabRealGenericJSON) {
  let temp = {} as HoYoLabTextGenericJSON;
  temp.description = `${extractTextFromHTML(jsonData.desc)}`;
  return temp;
}

function createAeonsJSON(jsonData: HoYoLabRealGenericJSON) {
  let textGenericJSON = {} as HoYoLabTextGenericJSON;
  textGenericJSON.description = `${extractTextFromHTML(jsonData.desc)}`;
  textGenericJSON.modules = [] as any[];

  for (const module of jsonData.modules) {
    const parsedModule = parseModule(module);
    if (parsedModule) {
      textGenericJSON.modules.push(...parsedModule);
    }
  }

  return textGenericJSON;
}

function newCreateCharacterJSON(jsonData: HoYoLabRealCharacterJSON) {
  let textCharacterJSON = {} as HoYoLabTextCharacterJSON;
  textCharacterJSON.description = `${extractTextFromHTML(jsonData.desc)}`;
  textCharacterJSON.modules = [] as any[];

  for (const module of jsonData.modules) {
    const parsedModule = parseModule(module);
    if (parsedModule) {
      textCharacterJSON.modules.push(...parsedModule);
    }
  }

  return textCharacterJSON;
}

function HoYoAPItoPlainText(
  jsonData: HoYoLabAPIJSON,
  switchMap: GenshinImpact | HonkaiStarRail
): HoYoLabTextFile {
  let fixedHoYoLabData = {} as HoYoLabTextFile;
  var HoYoJSONData;

  HoYoJSONData = jsonData.data.page as
    | HoYoLabRealGenericJSON
    | HoYoLabRealCharacterJSON;
  fixedHoYoLabData.name = HoYoJSONData.name;

  const menuName = jsonData.data.page.menu_name;

  // TypeScript needs to know whether the switchMap given is for Genshin or Star Rail.
  function isGenshinImpact(
    map: GenshinImpact | HonkaiStarRail
  ): map is GenshinImpact {
    return "Character Archive" in map;
  }

  if (menuName in switchMap) {
    let func;

    if (isGenshinImpact(switchMap)) {
      func = switchMap[menuName as keyof GenshinImpact];
    } else {
      func = switchMap[menuName as keyof HonkaiStarRail];
    }

    console.log(
      chalk.blue(
        `[${MODULE_NAME}] ${menuName} JSON detected. Creating PlainText of ${menuName} JSON: ${jsonData.data.page.name}`
      )
    );
    fixedHoYoLabData.type = menuName;
    fixedHoYoLabData.content = func(HoYoJSONData);
  } else {
    console.log(
      chalk.blue(
        `[${MODULE_NAME}] Non-Specific JSON detected. Attempting to creating PlainText of given JSON: ${jsonData.data.page.name}`
      )
    );
    fixedHoYoLabData.type = HoYoJSONData.menu_name;
    fixedHoYoLabData.content = createGenericJSON(HoYoJSONData);
  }
  return fixedHoYoLabData;
}

async function scrapeHoYoLabWiki(
  url: string,
  wiki: string
): Promise<HoYoLabTextFile[]> {
  const headers = {
    "User-Agent": USER_AGENT,
    "Accept-Language": "en-US,en;q=0.6",
    "X-Rpc-Language": "en-US",
    "X-Rpc-Wiki_app": wiki,
  };

  const switchMap =
    wiki === "genshin" ? GENSHIN_SWITCH_MAP : STAR_RAIL_SWITCH_MAP;

  console.log(
    chalk.blue(`[${MODULE_NAME}] Fetching the HoYoLAB Wiki Page from the API`)
  );
  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch the HoYoLAB Wiki page: ${response.statusText}`
    );
  }
  console.log(
    chalk.green(`[${MODULE_NAME}] Received response from the HoYoLAB Wiki API.`)
  );

  const responseJSON = (await response.json()) as HoYoLabAPIJSON;

  console.log(
    chalk.blue(
      `[${MODULE_NAME}] Converting the HoYoLAB Wiki for JSON Entry: '${responseJSON.data.page.name}' to Plain Text`
    )
  );
  const plainTextData = HoYoAPItoPlainText(responseJSON, switchMap);

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

      console.log(
        chalk.magenta(
          `[${MODULE_NAME}] Received a HoYoLAB Wiki Request for '${request.miHoYoWiki}' wiki with ID: '${request.miHoYoWikiID}'`
        )
      );

      if (!isValidHoYoWiki(request)) {
        console.error(
          chalk.red(`[${MODULE_NAME}] Scrape Failed! Invalid Wiki Request!`)
        );
        return res.status(400).json({ error: "Invalid Wiki Request" });
      }

      const wikiName = "Genshin" ? request.miHoYoWiki : "Honkai: Star Rail";
      console.log(
        chalk.blue(
          `[${MODULE_NAME}] Scraping the HoYoLAB ${wikiName} Wiki for Wiki ID: ${request.miHoYoWikiID}`
        )
      );

      const fullHoYoLabURL = `${HOYOLAB_URL}/${request.miHoYoWiki}/wapi/entry_page?entry_page_id=${request.miHoYoWikiID}`;

      const response = await scrapeHoYoLabWiki(
        fullHoYoLabURL,
        request.miHoYoWiki
      );
      console.log(
        chalk.green(
          `[${MODULE_NAME}] Scrape Successful for Wiki ID: ${request.miHoYoWikiID} in the ${wikiName} Wiki`
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
    chalk.yellow(`[${MODULE_NAME}] Exiting the HoYoWiki Scraper Plugin`)
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
