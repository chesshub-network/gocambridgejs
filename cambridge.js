// cambridge.js

// --- Konstanten (aus consts.go) ---

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36";
const APP_VERSION_HEADER = "cambridgeone-app-version";
const APP_VERSION = "v2";
const BASE_CAMBRIDGE_URL = "https://www.cambridgeone.org/nlp/apigateway/%s/product/%s/";
const LESSON_URL = "https://content.cambridgeone.org/cup1/products/%s/2/assets/ext-cup-xapiscoreable/%s/data.js";
const COOKIE_NAME = "c1_sid";
const AJAX_DATA = "ajaxData";
const AJAX_DATA_ERROR = "ajaxData not found";

const GENERIC_QUESTION_REGEX = `<p>Incorrect!<br />\\s*Correct answer:<br />\\s*(.+)</p>`;
const NORMAL_QUESTION_REGEX = `<correctResponse>(.*?)<\\/correctResponse>`;
const MULTI_QUESTION_REGEX = `Correct Answer:&lt;br /> (.*?)&lt;/p>`;
const CHOICE_QUESTION_REGEX = `(?s)Correct answers:<br />(.*?)</p>`;
const CHOICE_QUESTION_V2_REGEX = `(?s)Correct answer:<br />(.*?)</p>`;
const VALUE_RESPONSE_REGEX = `<value>(.*?)</value>`;
const POSSIBLE_QUESTION_REGEX = `(?s)Possible answers:<br />(.*?)</p>`;
const QUESTION_IDENTIFIER_REGEX = `identifier="([^"]+)"`;

const INVALID_QUESTION_TYPE = "Present:Present:Present";
const LEARNING_OBJECTINFO_XML = "LearningObjectInfo.xml";
const CORRECT_ANSWERS_FINDER = "Correct answers:";

// --- Typen (aus types.go) ---
// Im JS sind das nur Dokumentationskommentare, die Struktur bleibt aber gleich:
//
// UnitsResult: { toc: { result: Result[] } }
// Result: { name, "item-type", "item-code", "sub-type", items: ResultItem[] }
// ResultItem: { name, "item-type", "item-code", "sub-type", items: ItemItem[] }
// ItemItem: { name, "item-code", resource, "ext-cup-xapiscoreable": EXTCupXapiscoreable }
// EXTCupXapiscoreable: { url, filename, filesize, container, "cup-options": CupOptions }
// CupOptions: { contentid, title, engine, dp, lmsApis }

// --- Hilfsfunktionen (Port von utils.go) ---

function getQuestionType(xml) {
  const re = new RegExp(QUESTION_IDENTIFIER_REGEX);
  const match = re.exec(xml);
  if (match && match.length > 1) {
    return match[1];
  }
  return "";
}

function cleanSimpleQuestionValue(matches) {
  const cleanedValues = [];
  for (const m of matches) {
    cleanedValues.push(m[1]);
  }
  return cleanedValues.join(", ");
}

// Custom comparison function (compare in Go)
function compare(a, b) {
  if (a === b) return false;

  if (a === LEARNING_OBJECTINFO_XML) return true;
  if (b === LEARNING_OBJECTINFO_XML) return false;

  const aNumber = extractNumber(a);
  const bNumber = extractNumber(b);

  return aNumber < bNumber;
}

function extractNumber(s) {
  const parts = s.split(".xml");
  const num = parts[0];
  let number = 0;
  // fmt.Sscanf("cat%d", &number)
  const m = /^cat(\d+)$/.exec(num);
  if (m) {
    number = parseInt(m[1], 10);
  }
  return number;
}

function traverseDom(node, onText) {
  if (!node) return;
  if (node.nodeType === Node.TEXT_NODE && node.data.includes(CORRECT_ANSWERS_FINDER)) {
    for (let c = node.nextSibling; c != null; c = c.nextSibling) {
      if (c.nodeType === Node.TEXT_NODE) {
        onText(c.data.trim());
      }
    }
  }
  for (let c = node.firstChild; c != null; c = c.nextSibling) {
    traverseDom(c, onText);
  }
}

function cleanString(input) {
  const endIndex = input.indexOf("</p>");
  if (endIndex !== -1) {
    let textPart = input.slice(0, endIndex);
    textPart = textPart.trim();
    return textPart;
  }
  return input;
}

// regexp.FindAllStringSubmatch Port
function findAll(regex, text) {
  const matches = [];
  let m;
  const flags = regex.flags.includes("g") ? regex.flags : regex.flags + "g";
  const r = new RegExp(regex.source, flags);
  while ((m = r.exec(text)) !== null) {
    matches.push(m);
  }
  return matches;
}

// html.UnescapeString Port
function decodeHtml(str) {
  const txt = document.createElement("textarea");
  txt.innerHTML = str;
  return txt.value;
}

// --- Cambridge-Klasse (Port von cambridge.go) ---

class Cambridge {
  constructor(org, product, cookie) {
    this.baseUrl = BASE_CAMBRIDGE_URL
      .replace("%s", org)
      .replace("%s", product);

    this.appHeaders = {
      [APP_VERSION_HEADER]: APP_VERSION,
      "User-Agent": USER_AGENT,
    };

    // Hinweis: Im Browser kannst du Cookie-Header nicht frei setzen.
    // Das Cookie wird vom Browser verwaltet, wenn die Domain passt.
    this.cookie = cookie;
  }

  async getUnits(classPath) {
    const url = new URL(classPath, this.baseUrl).toString();

    const res = await fetch(url, {
      method: "GET",
      headers: this.appHeaders,
      credentials: "include",
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    return data; // entspricht UnitsResult
  }

  async getLessonResponse(productCode, lessonId) {
    const url = LESSON_URL
      .replace("%s", productCode)
      .replace("%s", lessonId);

    const res = await fetch(url, {
      method: "GET",
      headers: this.appHeaders,
      credentials: "include",
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const bodyText = await res.text();

    // Go: goja.RunString(body) -> ajaxData aus globalem Scope
    // JS im Browser: eval in Sandbox-Funktion
    const runtime = {};
    (function runInSandbox(runtimeObj) {
      // eslint-disable-next-line no-eval
      eval(bodyText);
      runtimeObj[AJAX_DATA] = typeof ajaxData !== "undefined" ? ajaxData : null;
    })(runtime);

    const ajaxDataValue = runtime[AJAX_DATA];
    if (!ajaxDataValue) {
      throw new Error(AJAX_DATA_ERROR);
    }

    const results = [];

    const normalQuestion = new RegExp(NORMAL_QUESTION_REGEX, "g");
    const genericQuestion = new RegExp(GENERIC_QUESTION_REGEX, "g");
    const multiQuestion = new RegExp(MULTI_QUESTION_REGEX, "g");
    const choiceQuestion = new RegExp(CHOICE_QUESTION_REGEX, "g");
    const choiceQuestionV2 = new RegExp(CHOICE_QUESTION_V2_REGEX, "g");
    const possibleAnswersQuestion = new RegExp(POSSIBLE_QUESTION_REGEX, "g");
    const valueResponse = new RegExp(VALUE_RESPONSE_REGEX, "g");

    const ajaxDataObject = ajaxDataValue;
    const objectKeys = Object.keys(ajaxDataObject);

    objectKeys.sort((a, b) => (compare(a, b) ? -1 : 1));

    for (const key of objectKeys) {
      const dataValue = ajaxDataObject[key];
      const dataValueStr = String(dataValue);

      const questionType = getQuestionType(dataValueStr);
      if (!questionType || questionType === INVALID_QUESTION_TYPE) {
        continue;
      }

      let matches = [];

      switch (questionType) {
        case "Order:Match:Text gap":
          matches.push(...findAll(genericQuestion, dataValueStr));
          if (matches.length === 0) {
            matches.push(...findAll(multiQuestion, dataValueStr));
          }
          break;

        case "Identify:Select:Dropdown":
          matches.push(...findAll(genericQuestion, dataValueStr));
          break;

        case "Input:Completion:Text gap":
          matches.push(...findAll(normalQuestion, dataValueStr));
          break;

        case "Identify:Select:Radiobutton":
          matches.push(...findAll(genericQuestion, dataValueStr));
          break;

        case "Identify:Select:Checkbox":
          matches = findAll(choiceQuestion, dataValueStr);
          if (matches.length === 0) {
            matches = findAll(choiceQuestionV2, dataValueStr);
            if (matches.length === 0) {
              const parser = new DOMParser();
              const doc = parser.parseFromString(dataValueStr, "text/html");
              let correctAnswersText = "";
              traverseDom(doc.body, (t) => {
                correctAnswersText += t;
              });
              return [correctAnswersText];
            }
          }
          break;

        default:
          matches.push(...findAll(possibleAnswersQuestion, dataValueStr));
      }

      for (const match of matches) {
        if (match.length > 1) {
          const inner = match[1];
          const valueMatches = findAll(valueResponse, inner);
          if (valueMatches.length > 0) {
            const cleanedString = cleanSimpleQuestionValue(valueMatches);
            results.push(cleanedString);
            continue;
          }

          let result = decodeHtml(inner);
          result = result.replace(/&apos;/g, "'");
          result = cleanString(result);
          results.push(result);
        }
      }
    }

    return results;
  }
}

// Export (für Module)
export { Cambridge };
