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

$requiredConfigKeys = ['api_base_url', 'web_base_url', 'site_code', 'api_key', 'deeplink_secret'];
$missingConfigKeys = array_filter(
    $requiredConfigKeys,
    static fn (string $key): bool => !array_key_exists($key, $config)
);
if ($missingConfigKeys !== []) {
    throw new RuntimeException('Missing required config key(s) in config/app.ini: ' . implode(', ', $missingConfigKeys));
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
    siteCode: (string) $config['site_code'],
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

$app->get('/', function (Request $request, Response $response) use ($baseHref, $config): Response {
    $template = file_get_contents(__DIR__ . '/../templates/app.html');
    $baseUrl = (string) $config['web_base_url'];
    $apiBaseDisplay = (string) parse_url($baseUrl, PHP_URL_HOST);
    if ($apiBaseDisplay === '') {
        $apiBaseDisplay = $baseUrl;
    }

    $html = str_replace(
        ['__BASE_HREF__', '__SITE_CODE__', '__API_BASE_URL__'],
        [
            htmlspecialchars($baseHref, ENT_QUOTES, 'UTF-8'),
            htmlspecialchars((string) $config['site_code'], ENT_QUOTES, 'UTF-8'),
            htmlspecialchars($apiBaseDisplay, ENT_QUOTES, 'UTF-8'),
        ],
        $template ?: ''
    );

    $response->getBody()->write($html);

    return $response->withHeader('Content-Type', 'text/html; charset=UTF-8');
});

$app->post('/api/deeplink', function (Request $request, Response $response) use ($client, $writeJson): Response {
    $data = (array) $request->getParsedBody();
    $customerNo = trim((string) ($data['customer_no'] ?? ''));
    $redirectUri = trim((string) ($data['redirect_uri'] ?? ''));

    if ($customerNo === '') {
        $customerNo = $generateCustomerNo();
    }

    try {
        return $writeJson($response, $client->createDeeplink($customerNo, $redirectUri));
    } catch (Throwable $exception) {
        return $writeJson($response, ['error' => $exception->getMessage()], 502);
    }
});

$app->post('/api/invitation', function (Request $request, Response $response) use ($client, $writeJson): Response {
    $data = (array) $request->getParsedBody();
    $customerNo = trim((string) ($data['customer_no'] ?? ''));

    if ($customerNo === '') {
        $customerNo = $generateCustomerNo();
    }

    try {
        return $writeJson($response, $client->createInvitation($customerNo));
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
        return $writeJson($response, $client->fetchLatestExport($customerNo));
    } catch (Throwable $exception) {
        return $writeJson($response, ['error' => $exception->getMessage()], 502);
    }
});

$app->run();
