<?php

declare(strict_types=1);

use App\PhotoCollectClient;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Factory\AppFactory;

require __DIR__ . '/../vendor/autoload.php';

$config = parse_ini_file(__DIR__ . '/../config/app.ini', false, INI_SCANNER_TYPED);
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

$siteCode = trim((string) $config['site_code']);
if ($siteCode === '') {
    throw new RuntimeException('The config key site_code must not be empty in config/app.ini.');
}

$booleanConfigKeys = [
    'collect_signature_request',
    'collect_customerto_request',
    'collect_verification_required',
    'firstgate_check_smile',
    'firstgate_check_sunglasses',
];
$normalizeHexColor = static function (mixed $candidate): string {
    $value = trim((string) $candidate);

    if ($value === '') {
        return '';
    }

    if (!preg_match('/^#[0-9A-Fa-f]{6}$/', $value)) {
        throw new InvalidArgumentException('The image_background_color value must use the format #RRGGBB.');
    }

    return strtoupper($value);
};
$resolveRequestConfig = static function (mixed $candidate) use ($booleanConfigKeys, $normalizeHexColor): ?array {
    if ($candidate === null) {
        return null;
    }

    if (!is_array($candidate)) {
        throw new InvalidArgumentException('The config field must be a JSON object.');
    }

    $config = [];
    foreach ($candidate as $key => $value) {
        $normalizedKey = trim((string) $key);
        if ($normalizedKey === '' || $value === null) {
            continue;
        }

        if ($normalizedKey === 'image_background_color') {
            $normalizedColor = $normalizeHexColor($value);

            if ($normalizedColor !== '') {
                $config[$normalizedKey] = $normalizedColor;
            }

            continue;
        }

        if (in_array($normalizedKey, $booleanConfigKeys, true)) {
            if (!is_bool($value)) {
                throw new InvalidArgumentException(sprintf('The %s config value must be a boolean.', $normalizedKey));
            }

            $config[$normalizedKey] = $value;
            continue;
        }

        if (!is_scalar($value) && !is_bool($value)) {
            throw new InvalidArgumentException(sprintf('The %s config value must be scalar.', $normalizedKey));
        }

        $config[$normalizedKey] = $value;
    }

    return $config === [] ? null : $config;
};

$supportedLocales = ['en_US', 'de_DE'];
$defaultLocale = 'en_US';
$resolveLocale = static function (?string $candidate) use ($supportedLocales, $defaultLocale): string {
    $candidate = trim((string) $candidate);
    if (in_array($candidate, $supportedLocales, true)) {
        return $candidate;
    }

    return $defaultLocale;
};

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

$writeJson = static function (Response $response, array $payload, int $status = 200): Response {
    $response->getBody()->write(json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

    return $response
        ->withHeader('Content-Type', 'application/json; charset=UTF-8')
        ->withStatus($status);
};

$generateCustomerNo = static function (): string {
    return substr(bin2hex(random_bytes(8)), 0, 16);
};
$buildAppBaseUrl = static function (Request $request) use ($baseHref): string {
    return (string) $request->getUri()
        ->withPath($baseHref)
        ->withQuery('')
        ->withFragment('');
};
$buildResultRedirectUrl = static function (Request $request, string $customerNo, string $locale, string $flow) use ($buildAppBaseUrl, $siteCode): string {
    $query = http_build_query([
        'screen' => 'result',
        'customer_no' => $customerNo,
        'site_code' => $siteCode,
        'locale' => $locale,
        'flow' => $flow,
    ], '', '&', PHP_QUERY_RFC3986);

    return $buildAppBaseUrl($request) . '?' . $query;
};

$app->get('/', function (Request $request, Response $response) use ($baseHref, $config, $generateCustomerNo): Response {
    $template = file_get_contents(__DIR__ . '/../templates/app.html');
    $baseUrl = (string) $config['web_base_url'];
    $apiBaseDisplay = (string) parse_url($baseUrl, PHP_URL_HOST);
    $params = $request->getQueryParams();
    $customerNo = trim((string) ($params['customer_no'] ?? ''));

    if ($apiBaseDisplay === '') {
        $apiBaseDisplay = $baseUrl;
    }

    if ($customerNo === '') {
        $customerNo = $generateCustomerNo();
    }

    $bootstrapJson = json_encode([
        'customerNo' => $customerNo,
    ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);

    $html = str_replace(
        ['__BASE_HREF__', '__API_BASE_URL__', '__APP_BOOTSTRAP__'],
        [
            htmlspecialchars($baseHref, ENT_QUOTES, 'UTF-8'),
            htmlspecialchars($apiBaseDisplay, ENT_QUOTES, 'UTF-8'),
            $bootstrapJson,
        ],
        $template ?: ''
    );

    $response->getBody()->write($html);

    return $response->withHeader('Content-Type', 'text/html; charset=UTF-8');
});

$app->post('/api/deeplink', function (Request $request, Response $response) use ($client, $writeJson, $generateCustomerNo, $resolveRequestConfig, $resolveLocale, $buildResultRedirectUrl): Response {
    $data = (array) $request->getParsedBody();
    $customerNo = trim((string) ($data['customer_no'] ?? ''));
    $locale = $resolveLocale($data['locale'] ?? null);
    $flow = trim((string) ($data['flow'] ?? ''));

    try {
        $requestConfig = $resolveRequestConfig($data['config'] ?? null);
    } catch (InvalidArgumentException $exception) {
        return $writeJson($response, ['error' => $exception->getMessage()], 400);
    }

    if ($customerNo === '') {
        $customerNo = $generateCustomerNo();
    }

    if (!in_array($flow, ['deeplink', 'deeplink-iframe'], true)) {
        return $writeJson($response, ['error' => 'The flow field must be deeplink or deeplink-iframe.'], 400);
    }

    $deeplinkConfig = array_merge(
        $requestConfig ?? [],
        [
            'collect_redirect_uri' => $flow === 'deeplink'
                ? $buildResultRedirectUrl($request, $customerNo, $locale, 'deeplink')
                : '',
        ]
    );

    try {
        return $writeJson($response, [
            'customer_no' => $customerNo,
            'deeplink_url' => $client->createDeeplink(
                customerNo: $customerNo,
                locale: $locale,
                config: $deeplinkConfig,
            ),
        ]);
    } catch (Throwable $exception) {
        return $writeJson($response, ['error' => $exception->getMessage()], 502);
    }
});

$app->post('/api/invitation', function (Request $request, Response $response) use ($client, $writeJson, $generateCustomerNo, $resolveRequestConfig, $resolveLocale): Response {
    $data = (array) $request->getParsedBody();
    $customerNo = trim((string) ($data['customer_no'] ?? ''));
    $locale = $resolveLocale($data['locale'] ?? null);
    try {
        $requestConfig = $resolveRequestConfig($data['config'] ?? null);
    } catch (InvalidArgumentException $exception) {
        return $writeJson($response, ['error' => $exception->getMessage()], 400);
    }

    if ($customerNo === '') {
        $customerNo = $generateCustomerNo();
    }

    try {
        return $writeJson($response, $client->createInvitation(
            customerNo: $customerNo,
            locale: $locale,
            config: $requestConfig,
        ));
    } catch (Throwable $exception) {
        return $writeJson($response, ['error' => $exception->getMessage()], 502);
    }
});

$app->get('/api/export', function (Request $request, Response $response) use ($client, $writeJson): Response {
    $customerNo = trim((string) ($request->getQueryParams()['customer_no'] ?? ''));

    if ($customerNo === '') {
        return $writeJson($response, ['error' => 'The customer_no query parameter is required.'], 400);
    }

    try {
        return $writeJson($response, $client->fetchLatestExport(customerNo: $customerNo));
    } catch (Throwable $exception) {
        return $writeJson($response, ['error' => $exception->getMessage()], 502);
    }
});

$app->run();
