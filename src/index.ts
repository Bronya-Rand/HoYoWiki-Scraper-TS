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

// Handles that nested JSON data that HoYoLAB uses for some reason.
interface HoYoLabAscendNestedJSON {
  list: [
    {
      key: string;
      combatList: [{ key: string; values: string[] }];
      materials: [string];
      id: string;
    }
  ];
}

interface HoyoLabEidolonsNestedJSON {
  list: [
    {
      name: string;
      icon_url: string;
      desc: string;
      id: string;
    }
  ];
}

interface HoyoLabStoryNestedJSON {
  list: [
    {
      title: string;
      desc: string;
    }
  ];
}

interface HoyoLabVONestedJSON {
  list: [
    {
      title: string;
      img: string;
      desc: string;
      artifactPos: string;
      id: string;
      audios: [{ id: string; name: string; url: string }];
      name: string;
      order: number;
      sortId: string;
    }
  ];
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

// Text File Interfaces
interface HoYoLabAscendStats {
  title: string;
  hp: string;
  atk: string;
  def: string;
  spd: string;
}

// We leaving out materials because it is a bunch of complicated things for now.
interface HoYoLabTextAscensions {
  level: string;
  beforeAscension: HoYoLabAscendStats;
  afterAscension: HoYoLabAscendStats;
}

interface HoYoLabTextEidolons {
  name: string;
  desc: string;
}

interface HoYoLabTextStory {
  title: string;
  desc: string;
}

interface HoYoLabTextFile {
  type: string;
  name: string;
  content: HoYoLabTextCharacterJSON | HoYoLabTextGenericJSON;
}

interface HoYoLabTextGenericJSON {
  description: string;
  faction?: string;
  path?: string;
  story?: HoYoLabTextStory[];
  modules?: any[];
}

interface HoYoLabTextCharacterJSON extends HoYoLabTextGenericJSON {
  description: string;
  path: string;
  faction: string;
  rarity: string;
  combat_type: string;
  ascension_levels: HoYoLabTextAscensions[];
  eidolons: HoYoLabTextEidolons[];
  story: HoYoLabTextStory[];
  voice_overs: HoYoLabTextStory[]; // Same code as stories.
}

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

function createCharacterJSON(
  jsonData: HoYoLabRealCharacterJSON
): HoYoLabTextCharacterJSON | HoYoLabTextGenericJSON {
  let temp = {} as HoYoLabTextCharacterJSON;

  temp.description = `${extractTextFromHTML(jsonData.desc)}`;
  temp.path = `${jsonData.filter_values.character_paths.values[0]}` || "";
  temp.faction = `${jsonData.filter_values.character_factions.values[0]}` || "";
  temp.rarity = `${jsonData.filter_values.character_rarity.values[0]}` || "";
  temp.combat_type =
    `${jsonData.filter_values.character_combat_type.values[0]}` || "";

  for (const module of jsonData.modules) {
    switch (module.name) {
      case "Ascend":
        const ascendData = JSON.parse(
          module.components[0].data
        ) as HoYoLabAscendNestedJSON;
        let ascensions = [] as HoYoLabTextAscensions[];

        for (const lvl in ascendData.list) {
          let ascension = {} as HoYoLabTextAscensions;
          let beforeAscension = {} as HoYoLabAscendStats;
          let afterAscension = {} as HoYoLabAscendStats;

          beforeAscension.title = "- Before Ascension";
          afterAscension.title = "- After Ascension";

          for (const combat of ascendData.list[lvl].combatList) {
            if (combat.key === "") {
              continue;
            }
            if (combat.key.endsWith("HP")) {
              beforeAscension.hp = combat.values[0];
              afterAscension.hp = combat.values[1];
            } else if (combat.key.endsWith("ATK")) {
              beforeAscension.atk = combat.values[0];
              afterAscension.atk = combat.values[1];
            } else if (combat.key.endsWith("DEF")) {
              beforeAscension.def = combat.values[0];
              afterAscension.def = combat.values[1];
            } else if (combat.key.endsWith("SPD")) {
              beforeAscension.spd = combat.values[0];
              afterAscension.spd = combat.values[1];
            }
          }

          ascension.level = ascendData.list[lvl].key;
          ascension.beforeAscension = beforeAscension;
          ascension.afterAscension = afterAscension;

          ascensions.push(ascension);
        }

        temp.ascension_levels = ascensions;
        break;
      case "Eidolons":
        const eidolonData = JSON.parse(
          module.components[0].data
        ) as HoyoLabEidolonsNestedJSON;
        let eidolons = [] as HoYoLabTextEidolons[];

        for (const eidolon of eidolonData.list) {
          let tempEidolon = {} as HoYoLabTextEidolons;

          tempEidolon.name = eidolon.name;
          tempEidolon.desc = extractTextFromHTML(eidolon.desc) as string;

          eidolons.push(tempEidolon);
        }

        temp.eidolons = eidolons;
        break;
      case "Story":
        const storyData = JSON.parse(
          module.components[0].data
        ) as HoyoLabStoryNestedJSON;
        let stories = [] as HoYoLabTextStory[];

        for (const story of storyData.list) {
          let tempStory = {} as HoYoLabTextStory;

          tempStory.title = story.title;
          tempStory.desc = extractTextFromHTML(story.desc) as string;

          stories.push(tempStory);
        }

        temp.story = stories;
        break;
      case "Voice-Over":
        const voiceData = JSON.parse(
          module.components[0].data
        ) as HoyoLabVONestedJSON;
        let voiceOvers = [] as HoYoLabTextStory[];

        for (const voice of voiceData.list) {
          let tempVoice = {} as HoYoLabTextStory;

          tempVoice.title = voice.name;
          tempVoice.desc = extractTextFromHTML(voice.desc) as string;

          voiceOvers.push(tempVoice);
        }

        temp.voice_overs = voiceOvers;
        break;
      default:
        console.log(
          chalk.yellow(
            `[${MODULE_NAME}] Module: ${module.name} is not supported for now`
          )
        );
        continue;
    }
  }
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
          console.log(
            chalk.blue(
              `[${MODULE_NAME}] Aeons JSON detected. Creating PlainText of Aeons JSON: ${jsonData.data.page.name}`
            )
          );
          fixedHoYoLabData.type = "Aeons";
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
