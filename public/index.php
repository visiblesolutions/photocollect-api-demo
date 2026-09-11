<?php

declare(strict_types=1);

use App\PhotoCollectClient;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Factory\AppFactory;

require __DIR__ . '/../vendor/autoload.php';

const APP_TEMPLATE_PATH = __DIR__ . '/../templates/app.html';
const APP_CONFIG_PATH = __DIR__ . '/../config/app.ini';
const DEFAULT_LOCALE = 'en_US';
const SUPPORTED_LOCALES = ['en_US', 'de_DE'];
const SUPPORTED_DEEPLINK_FLOWS = ['deeplink', 'deeplink-iframe'];
const BOOLEAN_REQUEST_CONFIG_KEYS = [
    'collect_signature_request',
    'collect_customerto_request',
    'collect_verification_required',
    'firstgate_check_smile',
    'firstgate_check_sunglasses',
    'firstgate_check_heavyframes',
];

/**
 * Accept a small, explicit subset of config values from the demo UI and reject
 * anything that cannot be represented safely in the downstream API payload.
 */
function normalizeRequestConfig(mixed $candidate): ?array
{
    if ($candidate === null) {
        return null;
    }

    if (!is_array($candidate)) {
        throw new InvalidArgumentException('The config field must be a JSON object.');
    }

    $normalizedConfig = [];

    foreach ($candidate as $key => $value) {
        $normalizedKey = trim((string) $key);
        if ($normalizedKey === '' || $value === null) {
            continue;
        }

        if ($normalizedKey === 'image_background_color') {
            $normalizedColor = strtoupper(trim((string) $value));
            if ($normalizedColor !== '' && !preg_match('/^#[0-9A-Fa-f]{6}$/', $normalizedColor)) {
                throw new InvalidArgumentException('The image_background_color value must use the format #RRGGBB.');
            }

            if ($normalizedColor !== '') {
                $normalizedConfig[$normalizedKey] = $normalizedColor;
            }

            continue;
        }

        if (in_array($normalizedKey, BOOLEAN_REQUEST_CONFIG_KEYS, true)) {
            if (!is_bool($value)) {
                throw new InvalidArgumentException(sprintf('The %s config value must be a boolean.', $normalizedKey));
            }

            $normalizedConfig[$normalizedKey] = $value;
            continue;
        }

        if (!is_scalar($value) && !is_bool($value)) {
            throw new InvalidArgumentException(sprintf('The %s config value must be scalar.', $normalizedKey));
        }

        $normalizedConfig[$normalizedKey] = $value;
    }

    return $normalizedConfig === [] ? null : $normalizedConfig;
}

function resolveLocale(mixed $candidate): string
{
    $locale = trim((string) $candidate);

    return in_array($locale, SUPPORTED_LOCALES, true) ? $locale : DEFAULT_LOCALE;
}

function writeJson(Response $response, array $payload, int $status = 200): Response
{
    $response->getBody()->write(json_encode(
        $payload,
        JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
    ));

    return $response
        ->withHeader('Content-Type', 'application/json; charset=UTF-8')
        ->withStatus($status);
}

function generateCustomerNo(): string
{
    return substr(bin2hex(random_bytes(8)), 0, 16);
}

$config = parse_ini_file(APP_CONFIG_PATH, false, INI_SCANNER_TYPED);
if ($config === false) {
    throw new RuntimeException('Unable to load config/app.ini.');
}

$requiredConfigKeys = ['api_base_url', 'web_base_url', 'api_key', 'deeplink_secret', 'site_code'];
$missingConfigKeys = array_filter(
    $requiredConfigKeys,
    static fn (string $key): bool => !array_key_exists($key, $config)
);
if ($missingConfigKeys !== []) {
    throw new RuntimeException('Missing required config key(s) in config/app.ini: ' . implode(', ', $missingConfigKeys));
}

// This demo uses one configured site code so the UI can focus on launch options.
$siteCode = trim((string) $config['site_code']);
if ($siteCode === '') {
    throw new RuntimeException('The config key site_code must not be empty in config/app.ini.');
}

$basePath = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/.');
$basePath = $basePath === '/' ? '' : $basePath;
$baseHref = $basePath === '' ? '/' : $basePath . '/';

$app = AppFactory::create();
$app->addBodyParsingMiddleware();
$app->addErrorMiddleware(true, true, true);

if ($basePath !== '') {
    $app->setBasePath($basePath);
}

$client = new PhotoCollectClient(
    apiBaseUrl: (string) $config['api_base_url'],
    webBaseUrl: (string) $config['web_base_url'],
    siteCode: $siteCode,
    apiKey: (string) $config['api_key'],
    deeplinkSecret: (string) $config['deeplink_secret'],
);

$app->get('/', function (Request $request, Response $response) use ($baseHref, $config): Response {
    $template = file_get_contents(APP_TEMPLATE_PATH);
    if ($template === false) {
        throw new RuntimeException('Unable to load templates/app.html.');
    }

    $queryParams = $request->getQueryParams();
    $customerNo = trim((string) ($queryParams['customer_no'] ?? ''));

    if ($customerNo === '') {
        $customerNo = generateCustomerNo();
    }

    $apiBaseDisplay = (string) parse_url((string) $config['web_base_url'], PHP_URL_HOST);
    if ($apiBaseDisplay === '') {
        $apiBaseDisplay = (string) $config['web_base_url'];
    }

    $bootstrapJson = json_encode(
        ['customerNo' => $customerNo],
        JSON_THROW_ON_ERROR
        | JSON_UNESCAPED_SLASHES
        | JSON_UNESCAPED_UNICODE
        | JSON_HEX_TAG
        | JSON_HEX_AMP
        | JSON_HEX_APOS
        | JSON_HEX_QUOT
    );

    $html = str_replace(
        ['__BASE_HREF__', '__API_BASE_URL__', '__APP_BOOTSTRAP__'],
        [
            htmlspecialchars($baseHref, ENT_QUOTES, 'UTF-8'),
            htmlspecialchars($apiBaseDisplay, ENT_QUOTES, 'UTF-8'),
            $bootstrapJson,
        ],
        $template
    );

    $response->getBody()->write($html);

    return $response->withHeader('Content-Type', 'text/html; charset=UTF-8');
});

$app->post('/api/deeplink', function (Request $request, Response $response) use ($baseHref, $client, $siteCode): Response {
    $data = (array) $request->getParsedBody();
    $customerNo = trim((string) ($data['customer_no'] ?? ''));
    $locale = resolveLocale($data['locale'] ?? null);
    $flow = trim((string) ($data['flow'] ?? ''));

    try {
        $requestConfig = normalizeRequestConfig($data['config'] ?? null);
    } catch (InvalidArgumentException $exception) {
        return writeJson($response, ['error' => $exception->getMessage()], 400);
    }

    if ($customerNo === '') {
        $customerNo = generateCustomerNo();
    }

    if (!in_array($flow, SUPPORTED_DEEPLINK_FLOWS, true)) {
        return writeJson($response, ['error' => 'The flow field must be deeplink or deeplink-iframe.'], 400);
    }

    // Standard deeplinks return the user to the result screen. The iframe flow
    // stays embedded, so it intentionally sends an empty redirect target.
    $collectRedirectUri = '';
    if ($flow === 'deeplink') {
        $resultQuery = http_build_query([
            'screen' => 'result',
            'customer_no' => $customerNo,
            'site_code' => $siteCode,
            'locale' => $locale,
            'flow' => $flow,
        ], '', '&', PHP_QUERY_RFC3986);

        $collectRedirectUri = (string) $request->getUri()
            ->withPath($baseHref)
            ->withQuery('')
            ->withFragment('') . '?' . $resultQuery;
    }

    $deeplinkConfig = array_merge(
        $requestConfig ?? [],
        [
            'collect_redirect_uri' => $collectRedirectUri,
        ]
    );

    try {
        return writeJson($response, [
            'customer_no' => $customerNo,
            'deeplink_url' => $client->createDeeplink(
                customerNo: $customerNo,
                locale: $locale,
                config: $deeplinkConfig,
            ),
        ]);
    } catch (Throwable $exception) {
        return writeJson($response, ['error' => $exception->getMessage()], 502);
    }
});

$app->post('/api/invitation', function (Request $request, Response $response) use ($client): Response {
    $data = (array) $request->getParsedBody();
    $customerNo = trim((string) ($data['customer_no'] ?? ''));
    $locale = resolveLocale($data['locale'] ?? null);

    try {
        $requestConfig = normalizeRequestConfig($data['config'] ?? null);
    } catch (InvalidArgumentException $exception) {
        return writeJson($response, ['error' => $exception->getMessage()], 400);
    }

    if ($customerNo === '') {
        $customerNo = generateCustomerNo();
    }

    try {
        return writeJson($response, $client->createInvitation(
            customerNo: $customerNo,
            locale: $locale,
            config: $requestConfig,
        ));
    } catch (Throwable $exception) {
        return writeJson($response, ['error' => $exception->getMessage()], 502);
    }
});

$app->get('/api/export', function (Request $request, Response $response) use ($client): Response {
    $customerNo = trim((string) ($request->getQueryParams()['customer_no'] ?? ''));
    if ($customerNo === '') {
        return writeJson($response, ['error' => 'The customer_no query parameter is required.'], 400);
    }

    try {
        return writeJson($response, $client->fetchLatestExport(customerNo: $customerNo));
    } catch (Throwable $exception) {
        return writeJson($response, ['error' => $exception->getMessage()], 502);
    }
});

$app->run();
