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

$requiredConfigKeys = ['api_base_url', 'web_base_url', 'api_key', 'deeplink_secret', 'supported_site_codes'];
$missingConfigKeys = array_filter(
    $requiredConfigKeys,
    static fn (string $key): bool => !array_key_exists($key, $config)
);
if ($missingConfigKeys !== []) {
    throw new RuntimeException('Missing required config key(s) in config/app.ini: ' . implode(', ', $missingConfigKeys));
}

$supportedSiteCodeLabels = [
    'api-demo' => 'Photo Flow',
    'api-demo-signature' => 'Photo & Signature Flow',
];

$availableSiteCodes = [];
foreach ((array) $config['supported_site_codes'] as $siteCode) {
    $siteCode = trim((string) $siteCode);
    if ($siteCode === '') {
        continue;
    }

    $availableSiteCodes[$siteCode] = $supportedSiteCodeLabels[$siteCode] ?? $siteCode;
}

if ($availableSiteCodes === []) {
    throw new RuntimeException('No supported_site_codes are configured in config/app.ini.');
}

$defaultSiteCode = array_key_first($availableSiteCodes);

if ($defaultSiteCode === null) {
    throw new RuntimeException('Unable to determine a default site_code. Ensure supported_site_codes is not empty.');
}

$siteCodeOptions = '';
foreach ($availableSiteCodes as $siteCode => $siteCodeLabel) {
    $siteCodeOptions .= sprintf(
        '                <option value="%s"%s>%s</option>' . PHP_EOL,
        htmlspecialchars((string) $siteCode, ENT_QUOTES, 'UTF-8'),
        $siteCode === $defaultSiteCode ? ' selected' : '',
        htmlspecialchars((string) $siteCodeLabel, ENT_QUOTES, 'UTF-8'),
    );
}

$resolveSiteCode = static function (?string $candidate) use ($availableSiteCodes, $defaultSiteCode): string {
    $candidate = trim((string) $candidate);
    if (array_key_exists($candidate, $availableSiteCodes)) {
        return $candidate;
    }

    return $defaultSiteCode;
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
    siteCode: (string) $defaultSiteCode,
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

$app->get('/', function (Request $request, Response $response) use ($baseHref, $config, $siteCodeOptions, $defaultSiteCode, $availableSiteCodes): Response {
    $template = file_get_contents(__DIR__ . '/../templates/app.html');
    $baseUrl = (string) $config['web_base_url'];
    $apiBaseDisplay = (string) parse_url($baseUrl, PHP_URL_HOST);
    if ($apiBaseDisplay === '') {
        $apiBaseDisplay = $baseUrl;
    }

    $html = str_replace(
        ['__BASE_HREF__', '__SITE_CODE__', '__API_BASE_URL__', '__SITE_CODE_OPTIONS__', '__SUPPORTED_SITE_CODES__'],
        [
            htmlspecialchars($baseHref, ENT_QUOTES, 'UTF-8'),
            htmlspecialchars((string) $defaultSiteCode, ENT_QUOTES, 'UTF-8'),
            htmlspecialchars($apiBaseDisplay, ENT_QUOTES, 'UTF-8'),
            $siteCodeOptions,
            htmlspecialchars(
                json_encode(array_keys($availableSiteCodes), JSON_THROW_ON_ERROR),
                ENT_QUOTES,
                'UTF-8'
            ),
        ],
        $template ?: ''
    );

    $response->getBody()->write($html);

    return $response->withHeader('Content-Type', 'text/html; charset=UTF-8');
});

$app->post('/api/deeplink', function (Request $request, Response $response) use ($client, $writeJson, $generateCustomerNo, $resolveSiteCode): Response {
    $data = (array) $request->getParsedBody();
    $customerNo = trim((string) ($data['customer_no'] ?? ''));
    $redirectUri = trim((string) ($data['redirect_uri'] ?? ''));
    $siteCode = $resolveSiteCode($data['site_code'] ?? null);

    if ($customerNo === '') {
        $customerNo = $generateCustomerNo();
    }

    try {
        return $writeJson($response, $client->createDeeplink($customerNo, $redirectUri, $siteCode));
    } catch (Throwable $exception) {
        return $writeJson($response, ['error' => $exception->getMessage()], 502);
    }
});

$app->post('/api/invitation', function (Request $request, Response $response) use ($client, $writeJson, $generateCustomerNo, $resolveSiteCode): Response {
    $data = (array) $request->getParsedBody();
    $customerNo = trim((string) ($data['customer_no'] ?? ''));
    $siteCode = $resolveSiteCode($data['site_code'] ?? null);

    if ($customerNo === '') {
        $customerNo = $generateCustomerNo();
    }

    try {
        return $writeJson($response, $client->createInvitation($customerNo, $siteCode));
    } catch (Throwable $exception) {
        return $writeJson($response, ['error' => $exception->getMessage()], 502);
    }
});

$app->get('/api/export', function (Request $request, Response $response) use ($client, $writeJson, $resolveSiteCode): Response {
    $customerNo = trim((string) ($request->getQueryParams()['customer_no'] ?? ''));
    $siteCode = $resolveSiteCode($request->getQueryParams()['site_code'] ?? null);

    if ($customerNo === '') {
        return $writeJson($response, ['error' => 'The customer_no query parameter is required.'], 400);
    }

    try {
        return $writeJson($response, $client->fetchLatestExport($customerNo, $siteCode));
    } catch (Throwable $exception) {
        return $writeJson($response, ['error' => $exception->getMessage()], 502);
    }
});

$app->run();
