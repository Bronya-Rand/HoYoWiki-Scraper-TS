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
  filter_values: {};
}

interface HoYoLabRealCharacterJSON extends HoYoLabRealGenericJSON {
  filter_values: {
    character_paths: { values: [string] };
    character_factions: { values: [string] };
    character_rarity: { values: [string] };
    character_combat_type: { values: [string] };
  };
}

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

function createGenericJSON(
  jsonData: HoYoLabRealGenericJSON
): HoYoLabTextGenericJSON {
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

  switch (jsonData.data.page.menu_name) {
    case "Characters":
      console.log(
        chalk.blue(
          `[${MODULE_NAME}] Character JSON detected. Creating PlainText of Character JSON: ${jsonData.data.page.name}`
        )
      );
      HoYoJSONData = jsonData.data.page as HoYoLabRealCharacterJSON;
      fixedHoYoLabData.name = HoYoJSONData.name;
      fixedHoYoLabData.type = "Character";
      fixedHoYoLabData.content = newCreateCharacterJSON(HoYoJSONData);
      break;
    case "Adventure":
    case "Aeons":
    case "Blessings":
    case "Curios":
    case "Enemies":
    case "Factions":
    case "Forgotten Hall":
    case "Inventory Items":
    case "Light Cones":
    case "Map Collections":
    case "NPCs":
    case "Path":
    case "Permanent Events":
    case "Phonograph":
    case "Pure Fiction":
    case "Readables":
    case "Regular Challenges":
    case "Relics":
    case "Simulated Universe":
    case "System":
    case "Terms":
    case "Time-Limited Events":
      HoYoJSONData = jsonData.data.page as HoYoLabRealGenericJSON;
      fixedHoYoLabData.name = HoYoJSONData.name;

      switch (jsonData.data.page.menu_name) {
        case "Adventure":
          console.log(
            chalk.blue(
              `[${MODULE_NAME}] Adventure JSON detected. Creating PlainText of Adventure JSON: ${jsonData.data.page.name}`
            )
          );
          fixedHoYoLabData.type = "Adventure";
          fixedHoYoLabData.content = createGenericJSON(HoYoJSONData);
          break;
        case "Aeons":
        case "Blessings":
        case "Curios":
        case "Enemies":
        case "Factions":
        case "Forgotten Hall":
        case "Inventory Items":
        case "Light Cones":
        case "Map Collections":
        case "NPCs":
        case "Path":
        case "Permanent Events":
        case "Phonograph":
        case "Pure Fiction":
        case "Readables":
        case "Regular Challenges":
        case "Relics":
        case "Simulated Universe":
        case "System":
        case "Terms":
        case "Time-Limited Events":
          console.log(
            chalk.blue(
              `[${MODULE_NAME}] Standard JSON detected. Creating PlainText of Standard JSON: ${jsonData.data.page.name}`
            )
          );
          switch (jsonData.data.page.menu_name) {
            case "Aeons":
              fixedHoYoLabData.type = "Aeons";
              break;
            case "Blessings":
              fixedHoYoLabData.type = "Blessings";
              break;
            case "Curios":
              fixedHoYoLabData.type = "Curios";
              break;
            case "Enemies":
              fixedHoYoLabData.type = "Enemies";
              break;
            case "Factions":
              fixedHoYoLabData.type = "Factions";
              break;
            case "Forgotten Hall":
              fixedHoYoLabData.type = "Forgotten Hall";
              break;
            case "Inventory Items":
              fixedHoYoLabData.type = "Inventory Items";
              break;
            case "Light Cones":
              fixedHoYoLabData.type = "Light Cones";
              break;
            case "Map Collections":
              fixedHoYoLabData.type = "Map Collections";
              break;
            case "NPCs":
              fixedHoYoLabData.type = "NPCs";
              break;
            case "Path":
              fixedHoYoLabData.type = "Path";
              break;
            case "Permanent Events":
              fixedHoYoLabData.type = "Permanent Events";
              break;
            case "Phonograph":
              fixedHoYoLabData.type = "Phonograph";
              break;
            case "Pure Fiction":
              fixedHoYoLabData.type = "Pure Fiction";
              break;
            case "Readables":
              fixedHoYoLabData.type = "Readables";
              break;
            case "Regular Challenges":
              fixedHoYoLabData.type = "Regular Challenges";
              break;
            case "Relics":
              fixedHoYoLabData.type = "Relics";
              break;
            case "Simulated Universe":
              fixedHoYoLabData.type = "Simulated Universe";
              break;
            case "System":
              fixedHoYoLabData.type = "System";
              break;
            case "Terms":
              fixedHoYoLabData.type = "Terms";
              break;
            case "Time-Limited Events":
              fixedHoYoLabData.type = "Time-Limited Events";
              break;
            default:
              throw new Error("Failed to assign correct type.");
          }
          fixedHoYoLabData.content = createAeonsJSON(HoYoJSONData);
          break;
        default:
          throw new Error("Failed to assign correct type.");
      }
      break;
    default:
      console.log(
        chalk.blue(
          `[${MODULE_NAME}] Non-Specific JSON detected. Attempting to creating PlainText of given JSON: ${jsonData.data.page.name}`
        )
      );
      HoYoJSONData = jsonData.data.page as HoYoLabRealGenericJSON;
      fixedHoYoLabData.name = HoYoJSONData.name;
      fixedHoYoLabData.type = HoYoJSONData.menu_name;
      fixedHoYoLabData.content = createGenericJSON(HoYoJSONData);
      break;
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
