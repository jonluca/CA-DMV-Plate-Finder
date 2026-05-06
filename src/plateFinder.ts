import { Agent, request } from "undici";
import userAgents from "top-user-agents";
import { formatPlateForDisplay, MAX_PERSONALIZED_PLATE_LENGTH, normalizePlateCandidate, validatePlateCandidate } from "./plateRules";

const USER_AGENT = userAgents[0];
const REFERER_URL = "https://www.dmv.ca.gov/wasapp/ipp2/initPers.do";
const VALIDATION_ENDPOINT = "https://www.dmv.ca.gov/wasapp/ipp2/checkPers.do";
const MAX_ERROR_RESPONSE_LENGTH = 200;

export type PlateStatus = "AVAILABLE" | "UNAVAILABLE" | "INVALID" | "ERROR";
export type PlateFinderResponse = {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: {
    text(): Promise<string>;
  };
};
export type PlateFinderRequestOptions = NonNullable<Parameters<typeof request>[1]>;
export type PlateFinderRequest = (url: string, options: PlateFinderRequestOptions) => Promise<PlateFinderResponse>;

interface PlateFinderOptions {
  request?: PlateFinderRequest;
}

export class PlateFinder {
  private agent: Agent;
  private sessionId: string = "";
  private cookies: string = "";
  private request: PlateFinderRequest;
  public availablePlates: string[];
  public platesChecked = 0;
  private plateGenerator: AsyncGenerator<string>;

  constructor(plateGenerator: AsyncGenerator<string>, options: PlateFinderOptions = {}) {
    this.plateGenerator = plateGenerator;
    this.availablePlates = [];
    this.agent = new Agent({
      keepAliveTimeout: 60000,
      keepAliveMaxTimeout: 600000,
      connections: 10,
      pipelining: 0,
    });
    this.request = options.request ?? ((url, requestOptions) => request(url, requestOptions) as Promise<PlateFinderResponse>);
  }

  async initialize(): Promise<void> {
    try {
      const startPage = await this.request(REFERER_URL, {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "User-Agent": USER_AGENT,
        },
        dispatcher: this.agent,
      });
      const startPageText = await startPage.body.text();
      this.captureCookies(startPage.headers["set-cookie"]);

      if (startPage.statusCode !== 200) {
        throw new Error(`DMV start page returned status ${startPage.statusCode}: ${formatResponseSnippet(startPageText)}`);
      }

      const acknowledgment = await this.request(VALIDATION_ENDPOINT, {
        method: "POST",
        headers: {
          Referer: REFERER_URL,
          "User-Agent": USER_AGENT,
          "Content-Type": "application/x-www-form-urlencoded",
          ...(this.cookies && { Cookie: this.cookies }),
        },
        body: new URLSearchParams({
          acknowledged: "true",
          _acknowledged: "on",
        }).toString(),
        dispatcher: this.agent,
      });
      const acknowledgmentText = await acknowledgment.body.text();
      this.captureCookies(acknowledgment.headers["set-cookie"]);

      if (acknowledgment.statusCode !== 200) {
        throw new Error(`DMV acknowledgment returned status ${acknowledgment.statusCode}: ${formatResponseSnippet(acknowledgmentText)}`);
      }

      if (!this.sessionId) {
        throw new Error("DMV did not return a JSESSIONID cookie");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to initialize session: ${errorMessage}`, { cause: error });
    }
  }

  private captureCookies(setCookieHeader: string | string[] | undefined): void {
    const cookiePairs = parseSetCookieHeader(setCookieHeader);
    if (cookiePairs.length === 0) {
      return;
    }

    const cookieJar = parseCookieHeader(this.cookies);
    for (const [name, value] of cookiePairs) {
      cookieJar.set(name, value);
      if (name === "JSESSIONID") {
        this.sessionId = value;
      }
    }

    this.cookies = Array.from(cookieJar, ([name, value]) => `${name}=${value}`).join("; ");
  }

  private updatePayload(plateNumber: string): Record<string, string> {
    const normalizedPlate = normalizePlateCandidate(plateNumber);
    const newPayload = {
      plateType: "Z",
      plateName: "California 1960s Legacy",
      plateLength: String(MAX_PERSONALIZED_PLATE_LENGTH),
      vehicleType: "AUTO",
    } as Record<string, string>;

    // Populate the payload with plate characters
    for (let i = 0; i < MAX_PERSONALIZED_PLATE_LENGTH; i++) {
      newPayload[`plateChar${i}`] = normalizedPlate[i] || "";
    }

    return newPayload;
  }

  async getPlateStatus(plate: string): Promise<PlateStatus> {
    const validation = validatePlateCandidate(plate);
    if (!validation.valid) {
      console.error(`Invalid plate ${formatPlateForDisplay(validation.plate || plate)}: ${validation.errors.join("; ")}`);
      return "INVALID";
    }

    const payload = this.updatePayload(validation.plate);

    try {
      const requestHeaders = {
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://www.dmv.ca.gov",
        Referer: REFERER_URL,
        "User-Agent": USER_AGENT,
        Cookie: this.cookies,
      };

      const { statusCode, body } = await this.request(VALIDATION_ENDPOINT, {
        method: "POST",
        headers: requestHeaders,
        body: new URLSearchParams(payload).toString(),
        dispatcher: this.agent,
      });

      if (statusCode !== 200) {
        throw new Error(`Unexpected status code: ${statusCode}`);
      }

      const responseText = await body.text();
      const responseData = JSON.parse(responseText) as { code?: unknown };
      const plateStatus = typeof responseData.code === "string" ? responseData.code : "UNKNOWN";

      if (plateStatus === "AVAILABLE") {
        console.log(`${formatPlateForDisplay(validation.plate)} is AVAILABLE`);
        this.availablePlates.push(validation.plate);
        return "AVAILABLE";
      }

      if (plateStatus === "VALIDATION") {
        return "INVALID";
      }

      return "UNAVAILABLE";
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error checking plate ${formatPlateForDisplay(plate)}: ${errorMessage}`);
      return "ERROR";
    }
  }

  async run(): Promise<void> {
    for await (const plate of this.plateGenerator) {
      const status = await this.getPlateStatus(plate);
      if (status === "ERROR") {
        console.error(`Failed to check plate ${formatPlateForDisplay(plate)}`);
      }
      this.platesChecked++;
    }
  }

  async *checkPlatesWithResults() {
    for await (const plate of this.plateGenerator) {
      const status = await this.getPlateStatus(plate);
      if (status === "ERROR") {
        console.error(`Failed to check plate ${formatPlateForDisplay(plate)}`);
      }
      this.platesChecked++;
      yield { plate: plate.toUpperCase(), status };
    }
  }
}

function parseSetCookieHeader(setCookieHeader: string | string[] | undefined): Array<[string, string]> {
  if (!setCookieHeader) {
    return [];
  }

  const setCookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];

  return setCookies.flatMap((cookie) => {
    const [cookiePair] = cookie.split(";", 1);
    if (!cookiePair) {
      return [];
    }

    const separatorIndex = cookiePair.indexOf("=");
    if (separatorIndex <= 0) {
      return [];
    }

    const name = cookiePair.slice(0, separatorIndex).trim();
    const value = cookiePair.slice(separatorIndex + 1).trim();

    return name ? [[name, value] as [string, string]] : [];
  });
}

function parseCookieHeader(cookieHeader: string): Map<string, string> {
  const cookieJar = new Map<string, string>();
  if (!cookieHeader) {
    return cookieJar;
  }

  for (const cookie of cookieHeader.split(";")) {
    const separatorIndex = cookie.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const name = cookie.slice(0, separatorIndex).trim();
    const value = cookie.slice(separatorIndex + 1).trim();
    if (name) {
      cookieJar.set(name, value);
    }
  }

  return cookieJar;
}

function formatResponseSnippet(responseText: string): string {
  const compactResponseText = responseText.replaceAll(/\s+/g, " ").trim();
  if (!compactResponseText) {
    return "empty response";
  }

  return compactResponseText.length > MAX_ERROR_RESPONSE_LENGTH
    ? `${compactResponseText.slice(0, MAX_ERROR_RESPONSE_LENGTH)}...`
    : compactResponseText;
}
