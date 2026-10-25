<?php

declare(strict_types=1);

use App\PhotoCollectClient;
use GuzzleHttp\Client;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Psr7\Response;

error_reporting(E_ALL);
$diagnostics = [];
set_error_handler(static function (int $severity, string $message) use (&$diagnostics): bool {
    if (error_reporting() & $severity) {
        $diagnostics[] = $message;
    }
    return false;
});

require __DIR__ . '/../vendor/autoload.php';

function check(bool $condition, string $message): void
{
    if (!$condition) {
        throw new LogicException($message);
    }
}

function expectFailure(callable $operation, string $message): void
{
    try {
        $operation();
    } catch (RuntimeException $exception) {
        check(str_contains($exception->getMessage(), $message), 'Unexpected error: ' . $exception->getMessage());
        return;
    }
    throw new LogicException('Expected error containing: ' . $message);
}

function clientWithResponses(array $responses): PhotoCollectClient
{
    return new PhotoCollectClient('https://api.test', 'https://web.test', 'test', 'test', 'test', new Client([
        'handler' => HandlerStack::create(new MockHandler($responses)),
        'http_errors' => false,
    ]));
}

function jsonResponse(mixed $data, int $status = 200): Response
{
    return new Response($status, [], json_encode($data, JSON_THROW_ON_ERROR));
}

foreach (['invitation_url', 'invitation_key'] as $field) {
    $client = clientWithResponses([jsonResponse([
        'invitation_url' => 'https://web.test/invitation',
        'invitation_key' => 'key',
        $field => ['unexpected'],
    ])]);
    expectFailure(fn () => $client->createInvitation('customer'), 'invalid ' . $field);
}

foreach ([false, 'unexpected', 123] as $files) {
    $client = clientWithResponses([jsonResponse(['files' => $files])]);
    expectFailure(fn () => $client->fetchLatestExport('customer'), 'invalid files collection');
}
foreach ([[false], [[], 'unexpected']] as $files) {
    $client = clientWithResponses([jsonResponse(['files' => $files])]);
    expectFailure(fn () => $client->fetchLatestExport('customer'), 'invalid export entry');
}
foreach (['uploaded_at', 'exported_at', 'file_type', 'file_content', 'invitation_key'] as $field) {
    $client = clientWithResponses([jsonResponse(['files' => [
        ['file_content' => 'b2xk', 'exported_at' => '2026-01-01'],
        ['file_content' => 'bmV3', 'exported_at' => '2026-02-01', $field => ['unexpected']],
    ]])]);
    // No DELETE response is queued: malformed exports must fail before deletion.
    expectFailure(fn () => $client->fetchLatestExport('customer'), 'invalid ' . $field);
}
$client = clientWithResponses([jsonResponse(['error' => ['unexpected']], 400)]);
expectFailure(fn () => $client->createInvitation('customer'), 'invalid error');
foreach ([null, false, 'unexpected', 123] as $body) {
    foreach ([200, 400] as $status) {
        $client = clientWithResponses([jsonResponse($body, $status)]);
        expectFailure(fn () => $client->createInvitation('customer'), 'unexpected response format');
    }
}

$client = clientWithResponses([
    jsonResponse(['invitation_url' => 'https://web.test/invitation', 'invitation_key' => 'key']),
    jsonResponse(['files' => []]),
    jsonResponse(['files' => [
        ['file_content' => 'bmV3', 'uploaded_at' => '2026-02-01', 'invitation_key' => 'key'],
        ['file_content' => 'b2xk', 'exported_at' => '2026-01-01'],
    ]]),
    jsonResponse(['deleted' => true]),
    jsonResponse(['error' => 'Upstream failure'], 400),
]);
check($client->createInvitation('customer')['invitation_key'] === 'key', 'Valid invitations must still work.');
check($client->fetchLatestExport('customer')['status'] === 'pending', 'Empty exports must remain pending.');
$export = $client->fetchLatestExport('customer');
check($export['image_url'] === 'data:image/jpeg;base64,bmV3', 'Newest export must be selected.');
check($export['delete_result'] === ['deleted' => true], 'Valid exports must still be deleted.');
expectFailure(fn () => $client->createInvitation('customer'), 'Upstream failure');

// Run the real front controller with dummy credentials, isolated quota storage,
// and E_ALL in each child. Invalid requests must never reach the upstream API.
$fixture = sys_get_temp_dir() . '/photocollect-compat-' . bin2hex(random_bytes(8));
mkdir($fixture . '/public', 0700, true);
mkdir($fixture . '/config', 0700);
copy(__DIR__ . '/../public/index.php', $fixture . '/public/index.php');
symlink(realpath(__DIR__ . '/../vendor'), $fixture . '/vendor');
symlink(realpath(__DIR__ . '/../templates'), $fixture . '/templates');
$config = implode("\n", [
    'api_base_url = "http://127.0.0.1:1"',
    'web_base_url = "https://web.test"',
    'site_code = "test"',
    'api_key = "test"',
    'deeplink_secret = "test"',
]);
file_put_contents($fixture . '/config/app.ini', $config);
$runner = <<<'RUNNER'
error_reporting(E_ALL);
ini_set('error_log', $argv[1] . '/application.log');
$diagnostics = [];
set_error_handler(static function (int $severity, string $message) use (&$diagnostics): bool {
    if (error_reporting() & $severity) {
        $diagnostics[] = $message;
    }
    return false;
});
$case = json_decode($argv[2], true, 512, JSON_THROW_ON_ERROR);
$_SERVER = [
    'REQUEST_METHOD' => $case['method'], 'REQUEST_URI' => $case['path'],
    'SCRIPT_NAME' => '/index.php', 'SERVER_NAME' => 'demo.test',
    'SERVER_PORT' => 80, 'REMOTE_ADDR' => '192.0.2.10',
    'CONTENT_TYPE' => 'application/x-www-form-urlencoded',
];
if ($case['method'] === 'GET') {
    $_SERVER['QUERY_STRING'] = http_build_query($case['data']);
    $_SERVER['REQUEST_URI'] .= '?' . $_SERVER['QUERY_STRING'];
}
$_POST = $case['data'];
$_GET = $case['data'];
try {
    require $argv[1] . '/public/index.php';
} catch (RuntimeException $exception) {
    echo $exception->getMessage();
}
echo "\n", http_response_code();
if ($diagnostics !== []) {
    fwrite(STDERR, implode("\n", $diagnostics));
    exit(1);
}
RUNNER;

function runController(string $fixture, string $runner, string $method, string $path, array $data): string
{
    $process = proc_open([
        PHP_BINARY, '-d', 'error_reporting=E_ALL', '-d', 'display_errors=1', '-r', $runner,
        $fixture, json_encode(['method' => $method, 'path' => $path, 'data' => $data], JSON_THROW_ON_ERROR),
    ], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    check(is_resource($process), 'Unable to start front controller.');
    fclose($pipes[0]);
    $output = stream_get_contents($pipes[1]);
    $errors = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    check(proc_close($process) === 0 && $errors === '', 'Front controller emitted diagnostics: ' . $errors);
    return $output;
}

try {
    foreach (['/api/deeplink', '/api/invitation'] as $path) {
        $fields = $path === '/api/deeplink' ? ['customer_no', 'locale', 'flow'] : ['customer_no', 'locale'];
        foreach ($fields as $field) {
            $output = runController($fixture, $runner, 'POST', $path, [
                'customer_no' => 'customer', 'flow' => 'deeplink', $field => ['unexpected'],
            ]);
            check(str_ends_with($output, "\n400") && str_contains($output, $field), 'Invalid field must return HTTP 400.');
        }
        $output = runController($fixture, $runner, 'POST', $path, [
            'flow' => 'deeplink', 'config' => ['image_background_color' => ['unexpected']],
        ]);
        check(str_ends_with($output, "\n400"), 'Array background color must return HTTP 400.');
    }
    foreach (['/', '/api/export'] as $path) {
        $output = runController($fixture, $runner, 'GET', $path, ['customer_no' => ['unexpected']]);
        check(str_ends_with($output, "\n400"), 'Array query parameter must return HTTP 400.');
    }
    $output = runController($fixture, $runner, 'GET', '/', ['customer_no' => 'customer']);
    check(str_ends_with($output, "\n200") && str_contains($output, '<html'), 'Homepage must still render.');
    $output = runController($fixture, $runner, 'POST', '/api/deeplink', [
        'customer_no' => 123, 'flow' => 'deeplink-iframe', 'locale' => null,
        'config' => ['image_background_color' => '#abcdef', 'collect_signature_request' => true],
    ]);
    check(str_ends_with($output, "\n200"), 'Valid scalar input must remain supported.');
    $body = json_decode(substr($output, 0, -4), true, 512, JSON_THROW_ON_ERROR);
    parse_str((string) parse_url($body['deeplink_url'], PHP_URL_QUERY), $query);
    $payload = json_decode(base64_decode($query['payload'], true), true, 512, JSON_THROW_ON_ERROR);
    check($payload['customer_no'] === '123', 'Numeric customer numbers must remain supported.');
    check($payload['config']['image_background_color'] === '#ABCDEF', 'Colors must be normalized.');
    check($payload['config']['collect_signature_request'] === true, 'Boolean config must remain boolean.');
    check($query['locale'] === 'en_US', 'Null locale must use the default.');
    check(hash_equals(hash_hmac('sha256', base64_decode($query['payload'], true), 'test'), $query['sig']), 'Signature must remain valid.');

    foreach (['api_base_url', 'web_base_url', 'site_code', 'api_key', 'deeplink_secret'] as $field) {
        file_put_contents($fixture . '/config/app.ini', $config . "\n" . $field . '[] = "unexpected"');
        $output = runController($fixture, $runner, 'GET', '/', []);
        check(str_contains($output, 'config key ' . $field . ' must be scalar'), 'Array INI values need a controlled error.');
    }
    unlink($fixture . '/config/app.ini');
    $output = runController($fixture, $runner, 'GET', '/', []);
    check(str_contains($output, 'Unable to load config/app.ini.'), 'Missing config needs a controlled error.');
    file_put_contents($fixture . '/config/app.ini', $config);
    unlink($fixture . '/templates');
    $output = runController($fixture, $runner, 'GET', '/', []);
    check(str_ends_with($output, "\n500"), 'Missing template must return HTTP 500.');
} finally {
    $entries = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($fixture, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST,
    );
    foreach ($entries as $entry) {
        if ($entry->isDir() && !$entry->isLink()) {
            rmdir($entry->getPathname());
        } else {
            unlink($entry->getPathname());
        }
    }
    rmdir($fixture);
}

check($diagnostics === [], 'PHP emitted diagnostics: ' . implode('; ', $diagnostics));
echo "PHP compatibility checks passed on " . PHP_VERSION . ".\n";
