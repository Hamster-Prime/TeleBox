import { Api } from "teleproto/tl";
import { sleep } from "teleproto/Helpers";

const { HTMLParser } = require("teleproto/extensions/html");
const HTML_PATCHED = Symbol.for("telebox.htmlParser.patched");
const MESSAGE_PATCHED = Symbol.for("telebox.messagePrototype.patched");

const ENTITY_REPLACEMENTS = [
  { entity: "&lt;", value: "<", name: "lt" },
  { entity: "&gt;", value: ">", name: "gt" },
  { entity: "&quot;", value: '"', name: "quot" },
  { entity: "&#39;", value: "'", name: "apos" },
  { entity: "&amp;", value: "&", name: "amp" },
] as const;

type EntityToken = {
  entity: string;
  value: string;
  token: string;
};

function makeEntityTokens(input: string): EntityToken[] {
  for (let nonce = 0; nonce < 1000; nonce++) {
    const tokens = ENTITY_REPLACEMENTS.map(({ entity, value, name }) => ({
      entity,
      value,
      token: `\uE000TELEBOX_HTML_${nonce}_${name}\uE001`,
    }));
    if (tokens.every(({ token }) => !input.includes(token))) {
      return tokens;
    }
  }
  throw new Error("Unable to allocate collision-free HTML entity sentinels");
}

function replaceAllLiteral(input: string, search: string, replacement: string): string {
  return input.split(search).join(replacement);
}

function protectHtmlEntities(input: string): { html: string; tokens: EntityToken[] } {
  const tokens = makeEntityTokens(input);
  let html = input;
  for (const { entity, token } of tokens) {
    html = replaceAllLiteral(html, entity, token);
  }
  return { html, tokens };
}

function restoreHtmlEntities(input: string, tokens: EntityToken[]): string {
  let text = input;
  for (const { token, value } of tokens) {
    text = replaceAllLiteral(text, token, value);
  }
  return text;
}

if (!HTMLParser[HTML_PATCHED]) {
  const originalHtmlParse = HTMLParser.parse.bind(HTMLParser);
  HTMLParser.parse = function patchedHtmlParse(html: string) {
    const protectedInput = protectHtmlEntities(html);
    const [text, entities] = originalHtmlParse(protectedInput.html);
    return [restoreHtmlEntities(text, protectedInput.tokens), entities];
  };
  HTMLParser[HTML_PATCHED] = true;
}

if (!(Api.Message.prototype as any)[MESSAGE_PATCHED]) {
  Api.Message.prototype.deleteWithDelay = async function (
    delay: number,
    shouldThrowError: boolean
  ) {
    await sleep(delay);
    try {
      return this.delete();
    } catch (e) {
      console.error(e);
      if (shouldThrowError) {
        throw e;
      }
    }
  };

  Api.Message.prototype.safeDelete = async function (
    { revoke }: { revoke: boolean } = { revoke: false }
  ) {
    try {
      return this.delete({ revoke });
    } catch (error) {
      console.log("safeDelete catch error:", error);
    }
  };

  (Api.Message.prototype as any)[MESSAGE_PATCHED] = true;
}
