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
  let dom;
  if (Array.isArray(html)) {
    // We only want to clean out the individual strings in the array.
    const cleanValue = DOMPurify.sanitize(
      html[0].replace(/<\/p><p>/g, " ").replace(/<\/?(p|strong)>/g, "")
    ).trim();
    dom = new JSDOM(cleanValue);
  } else {
    const modifiedHtml = html.replace(/<\/?(p|strong)>/g, " ");
    const cleanHTML = DOMPurify.sanitize(modifiedHtml) as string;
    dom = new JSDOM(cleanHTML);
  }
  return dom.window.document.body.textContent || "";
}

function isValidHoYoWiki(request: HoYoLabPageRequest): boolean {
  return validWikis.includes(request.miHoYoWiki);
}

function createGenericJSON(jsonData: HoYoLabRealGenericJSON) {
  let temp = {} as HoYoLabTextGenericJSON;
  temp.description = `${extractTextFromHTML(jsonData.desc)}`;
  return temp;
}

function createAeonsJSON(jsonData: HoYoLabRealGenericJSON) {
  let temp = {} as HoYoLabTextGenericJSON;
  temp.description = `${extractTextFromHTML(jsonData.desc)}`;
  temp.modules = [] as any[];

  for (const module of jsonData.modules) {
    if (module.name === "") {
      console.log(
        chalk.yellow(
          `[${MODULE_NAME}] Empty Module Name detected. Assuming no data is present`
        )
      );
      continue;
    }
    console.log(chalk.magenta(`Parsing Module: ${module.name}`));

    if (module.components[0].data === "") {
      console.log(
        chalk.yellow(
          `[${MODULE_NAME}] Module: ${module.name} is empty. Skipping...`
        )
      );
      continue;
    }

    const secondaryTemp = JSON.parse(
      module.components[0].data
    ) as HoYoLabGenericNestedJSON;

    const modulo = { name: module.name, data: [] as any[] };

    // Checking if we indeed have a list property
    if (secondaryTemp.hasOwnProperty("list")) {
      for (const data of secondaryTemp.list ?? [{ key: "", value: [""] }]) {
        console.log(chalk.magenta(`Parsing Data`));
        if (data.hasOwnProperty("value")) {
          modulo.data.push({
            key: data.key,
            value: extractTextFromHTML(data.value),
          });
        } else if (
          data.hasOwnProperty("title") &&
          data.hasOwnProperty("desc")
        ) {
          modulo.data.push({
            key: data.title,
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
    } else {
      if (secondaryTemp.hasOwnProperty("data")) {
        modulo.data.push({
          key: "",
          value: extractTextFromHTML(secondaryTemp.data as string),
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
    temp.modules?.push(modulo);
  }
  //console.log(temp.modules);
  return temp;
}

function newCreateCharacterJSON(jsonData: HoYoLabRealCharacterJSON) {
  let temp = {} as HoYoLabTextCharacterJSON;
  temp.description = `${extractTextFromHTML(jsonData.desc)}`;
  temp.modules = [] as any[];

  for (const module of jsonData.modules) {
    if (module.name === "") {
      console.log(
        chalk.yellow(
          `[${MODULE_NAME}] Empty Module Name detected. Assuming no data is present`
        )
      );
      continue;
    }
    console.log(chalk.magenta(`Parsing Module: ${module.name}`));

    if (module.components[0].data === "") {
      console.log(
        chalk.yellow(
          `[${MODULE_NAME}] Module: ${module.name} is empty. Skipping...`
        )
      );
      continue;
    }

    const secondaryTemp = JSON.parse(
      module.components[0].data
    ) as HoYoLabGenericNestedJSON;

    const modulo = { name: module.name, data: [] as any[] };

    // Checking if we indeed have a list property
    if (secondaryTemp.hasOwnProperty("list")) {
      for (const data of secondaryTemp.list ?? [{ key: "", value: [""] }]) {
        console.log(chalk.magenta(`Parsing Data`));
        // For Typical Data
        if (data.hasOwnProperty("value")) {
          modulo.data.push({
            key: data.key,
            value: extractTextFromHTML(data.value),
          });
          // For Voice-Over/Story Data
        } else if (
          data.hasOwnProperty("key") &&
          data.hasOwnProperty("values")
        ) {
          modulo.data.push({
            key: data.key,
            value: extractTextFromHTML(data.values),
          });
          // For Ascension Data
        } else if (
          data.hasOwnProperty("title") &&
          data.hasOwnProperty("desc")
        ) {
          modulo.data.push({
            key: data.title,
            value: extractTextFromHTML(data.desc),
          });
          // For Eidolon Data
        } else if (data.hasOwnProperty("name") && data.hasOwnProperty("desc")) {
          modulo.data.push({
            key: data.name,
            value: extractTextFromHTML(data.desc),
          });
        } else {
          console.log(
            chalk.yellow(
              `[${MODULE_NAME}] Module [${module.name}] seems to not have a 'value' field. Skipping...`
            )
          );
          continue;
        }
      }
    } else {
      if (secondaryTemp.hasOwnProperty("data")) {
        modulo.data.push({
          key: "",
          value: extractTextFromHTML(secondaryTemp.data as string),
        });
      } else {
        console.log(
          chalk.yellow(
            `[${MODULE_NAME}] Module [${module.name}] seems to not have a 'data' field. Skipping...`
          )
        );
        continue;
      }
    }
    temp.modules?.push(modulo);
  }
  //console.log(temp.modules);
  return temp;
}

function HoYoAPItoPlainText(jsonData: HoYoLabAPIJSON): HoYoLabTextFile {
  let fixedHoYoLabData = {} as HoYoLabTextFile;
  var HoYoJSONData;

  HoYoJSONData = jsonData.data.page as
    | HoYoLabRealGenericJSON
    | HoYoLabRealCharacterJSON;
  fixedHoYoLabData.name = HoYoJSONData.name;

  const menuName = jsonData.data.page.menu_name;
  if (menuName in STAR_RAIL_SWITCH_MAP) {
    const func =
      STAR_RAIL_SWITCH_MAP[menuName as keyof typeof STAR_RAIL_SWITCH_MAP];
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
  const plainTextData = HoYoAPItoPlainText(responseJSON);

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
