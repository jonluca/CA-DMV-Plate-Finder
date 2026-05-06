import assert from "node:assert/strict";

import { PlateFinder, type PlateFinderRequest, type PlateFinderRequestOptions, type PlateFinderResponse } from "./plateFinder.js";

type StubResponse = {
  statusCode: number;
  headers?: Record<string, string | string[] | undefined>;
  bodyText?: string;
};

type RecordedRequest = {
  url: string;
  options: PlateFinderRequestOptions;
};

function createStubRequest(responses: StubResponse[]): { request: PlateFinderRequest; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];

  return {
    requests,
    request: async (url, options) => {
      const response = responses.shift();
      assert.ok(response, `Unexpected request to ${url}`);

      requests.push({ url, options });

      return {
        statusCode: response.statusCode,
        headers: response.headers ?? {},
        body: {
          text: async () => response.bodyText ?? "",
        },
      } satisfies PlateFinderResponse;
    },
  };
}

function getHeader(options: PlateFinderRequestOptions, headerName: string): string | string[] | undefined {
  const headers = options.headers;
  if (!headers || typeof headers !== "object" || Symbol.iterator in headers) {
    return undefined;
  }

  return (headers as Record<string, string | string[] | undefined>)[headerName];
}

async function* createPlateGenerator(): AsyncGenerator<string> {
  for (const plate of ["TESTME"]) {
    yield plate;
  }
}

async function assertInitializesWithBrowserSessionCookies(): Promise<void> {
  const { request, requests } = createStubRequest([
    {
      statusCode: 200,
      headers: {
        "set-cookie": ["AWSALB=sticky; Path=/", "JSESSIONID=start-session; Path=/; HttpOnly"],
      },
      bodyText: "<html>start</html>",
    },
    {
      statusCode: 200,
      headers: {
        "set-cookie": ["JSESSIONID=ack-session; Path=/; HttpOnly", "TS01dc4fc6=security; Path=/; Secure"],
      },
      bodyText: '{ "success": false, "code": "VALIDATION" }',
    },
    {
      statusCode: 200,
      headers: {},
      bodyText: '{ "success": true, "code": "TAKEN" }',
    },
  ]);
  const finder = new PlateFinder(createPlateGenerator(), { request });

  await finder.initialize();
  const status = await finder.getPlateStatus("TESTME");

  assert.equal(status, "UNAVAILABLE");
  assert.equal(requests.length, 3);
  assert.equal(requests[0]?.url, "https://www.dmv.ca.gov/wasapp/ipp2/initPers.do");
  assert.equal(requests[0]?.options.method, "GET");
  assert.equal(requests[1]?.url, "https://www.dmv.ca.gov/wasapp/ipp2/checkPers.do");
  assert.equal(requests[1]?.options.method, "POST");
  assert.equal(requests[1] ? getHeader(requests[1].options, "Cookie") : undefined, "AWSALB=sticky; JSESSIONID=start-session");
  assert.equal(
    requests[2] ? getHeader(requests[2].options, "Cookie") : undefined,
    "AWSALB=sticky; JSESSIONID=ack-session; TS01dc4fc6=security",
  );
}

async function assertMissingSessionCookieFailsClearly(): Promise<void> {
  const { request } = createStubRequest([
    {
      statusCode: 200,
      headers: {
        "set-cookie": "AWSALB=sticky; Path=/",
      },
      bodyText: "<html>start</html>",
    },
    {
      statusCode: 200,
      headers: {},
      bodyText: '{ "success": false, "code": "VALIDATION" }',
    },
  ]);
  const finder = new PlateFinder(createPlateGenerator(), { request });

  await assert.rejects(() => finder.initialize(), /Failed to initialize session: DMV did not return a JSESSIONID cookie/);
}

await assertInitializesWithBrowserSessionCookies();
await assertMissingSessionCookieFailsClearly();
