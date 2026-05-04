import { Agent, request } from "undici";
import userAgents from "top-user-agents";
import { MAX_PERSONALIZED_PLATE_LENGTH, normalizePlateCandidate, validatePlateCandidate } from "./plateRules";

const USER_AGENT = userAgents[0];
const REFERER_URL = "https://www.dmv.ca.gov/wasapp/ipp2/initPers.do";
const VALIDATION_ENDPOINT = "https://www.dmv.ca.gov/wasapp/ipp2/checkPers.do";

export type PlateStatus = "AVAILABLE" | "UNAVAILABLE" | "INVALID" | "ERROR";

export class PlateFinder {
  private agent: Agent;
  private sessionId: string = "";
  private cookies: string = "";
  public availablePlates: string[];
  public platesChecked = 0;
  private plateGenerator: AsyncGenerator<string>;

  constructor(plateGenerator: AsyncGenerator<string>) {
    this.plateGenerator = plateGenerator;
    this.availablePlates = [];
    this.agent = new Agent({
      keepAliveTimeout: 60000,
      keepAliveMaxTimeout: 600000,
      connections: 10,
      pipelining: 0,
    });
  }

  async initialize(): Promise<void> {
    try {
      const { statusCode, headers, body } = await request(VALIDATION_ENDPOINT, {
        method: "POST",
        headers: {
          Referer: REFERER_URL,
          "User-Agent": USER_AGENT,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          acknowledged: "true",
          _acknowledged: "on",
        }).toString(),
        dispatcher: this.agent,
      });

      if (statusCode !== 200) {
        throw new Error(`Unexpected status code: ${statusCode}`);
      }

      // Extract session ID from cookies if available
      const setCookieHeader = headers["set-cookie"];
      if (setCookieHeader) {
        const cookieValue = Array.isArray(setCookieHeader) ? setCookieHeader.join(" ") : setCookieHeader;
        if (typeof cookieValue === "string") {
          const jsessionMatch = cookieValue.match(/JSESSIONID=([^;]+)/);
          if (jsessionMatch && jsessionMatch[1]) {
            this.sessionId = jsessionMatch[1];
            this.cookies = `JSESSIONID=${this.sessionId}`;
            console.debug(`Initialized session with ID: ${this.sessionId}`);
          }
        }
      }

      // Consume the body to free up the connection
      await body.text();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to initialize session: ${errorMessage}`, { cause: error });
    }
    if (!this.sessionId) {
      throw new Error(`Failed to obtain session ID!`);
    }
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
      console.error(`Invalid plate ${validation.plate || plate}: ${validation.errors.join("; ")}`);
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

      const { statusCode, body } = await request(VALIDATION_ENDPOINT, {
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
        console.log(`${validation.plate} is AVAILABLE`);
        this.availablePlates.push(validation.plate);
        return "AVAILABLE";
      }

      if (plateStatus === "VALIDATION") {
        return "INVALID";
      }

      return "UNAVAILABLE";
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error checking plate ${plate}: ${errorMessage}`);
      return "ERROR";
    }
  }

  async run(): Promise<void> {
    for await (const plate of this.plateGenerator) {
      const status = await this.getPlateStatus(plate);
      if (status === "ERROR") {
        console.error(`Failed to check plate ${plate}`);
      }
      this.platesChecked++;
    }
  }

  async *checkPlatesWithResults() {
    for await (const plate of this.plateGenerator) {
      const status = await this.getPlateStatus(plate);
      if (status === "ERROR") {
        console.error(`Failed to check plate ${plate}`);
      }
      this.platesChecked++;
      yield { plate: plate.toUpperCase(), status };
    }
  }
}
