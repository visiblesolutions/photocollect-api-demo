<?php

declare(strict_types=1);

use App\CreationRateLimiter;
use App\CreationRateLimitMiddleware;
use Slim\Factory\AppFactory;
use Slim\Psr7\Factory\ServerRequestFactory;

require __DIR__ . '/../vendor/autoload.php';

if (($argv[1] ?? '') === 'worker') {
    echo (new CreationRateLimiter($argv[2]))->consume('concurrent', 100000);
    exit;
}

function check(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function removeDirectory(string $directory): void
{
    foreach (new FilesystemIterator($directory) as $entry) {
        if ($entry->isDir() && !$entry->isLink()) {
            removeDirectory($entry->getPathname());
        } else {
            unlink($entry->getPathname());
        }
    }
    rmdir($directory);
}

$directory = sys_get_temp_dir() . '/photocollect-rate-limit-test-' . bin2hex(random_bytes(8));
mkdir($directory, 0700);

try {
    $limiter = new CreationRateLimiter($directory . '/rolling');
    for ($i = 0; $i < 20; $i++) {
        check($limiter->consume('visitor', 100000 + $i) === 0, 'First 20 attempts should pass.');
    }
    $limiter = new CreationRateLimiter($directory . '/rolling');
    check($limiter->consume('visitor', 100020) === 86380, 'Quota must persist across instances.');
    check($limiter->consume('other-visitor', 100020) === 0, 'Visitors need independent quotas.');
    check($limiter->consume('visitor', 186399) === 1, 'Must block until the full 24 hours elapse.');
    check($limiter->consume('visitor', 186400) === 0, 'Oldest attempt must expire exactly at 24 hours.');
    check($limiter->consume('visitor', 186400) === 1, 'Only one rolling-window slot should reopen.');
    check($limiter->consume('visitor', 300000) === 0, 'Expired quota should reset.');
    $snapshot = json_decode(file_get_contents($directory . '/rolling/creation.json'), true, 512, JSON_THROW_ON_ERROR);
    check($snapshot === ['visitor' => [300000]], 'Expired visitor entries must be pruned.');

    // Exercise both endpoints through Slim and ensure rejected requests never
    // reach the handler (which would create a link or call the upstream API).
    $app = AppFactory::create();
    $guard = new CreationRateLimitMiddleware(
        new CreationRateLimiter($directory . '/http'),
        $app->getResponseFactory(),
        'test-secret',
    );
    $creations = 0;
    $create = static function ($request, $response) use (&$creations) {
        $creations++;
        return $response;
    };
    $app->post('/api/deeplink', $create)->add($guard);
    $app->post('/api/invitation', $create)->add($guard);
    $app->get('/api/export', static fn ($request, $response) => $response);
    $factory = new ServerRequestFactory();
    for ($i = 0; $i < 20; $i++) {
        $request = $factory->createServerRequest(
            'POST',
            'https://demo.test/api/' . ($i % 2 ? 'invitation' : 'deeplink'),
            ['REMOTE_ADDR' => '192.0.2.1'],
        )->withParsedBody(['customer_no' => 'customer-' . $i, 'flow' => $i % 3 ? 'deeplink' : 'deeplink-iframe']);
        check($app->handle($request)->getStatusCode() === 200, 'Combined first 20 creations should pass.');
    }
    $request = $request->withHeader('X-Forwarded-For', '192.0.2.2')
        ->withHeader('Forwarded', 'for=192.0.2.3')
        ->withCookieParams(['PHPSESSID' => 'new-session']);
    $response = $app->handle($request);
    check($response->getStatusCode() === 429, 'Headers, cookies and customer numbers must not reset quota.');
    check($creations === 20, 'Blocked requests must not invoke creation.');
    $body = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
    check($body['retry_after'] > 0 && $body['retry_after'] <= 86400, 'Response needs a valid retry time.');
    check($response->getHeaderLine('Retry-After') === (string) $body['retry_after'], 'Retry header must match JSON.');
    check(isset($body['error']) && $response->getHeaderLine('Cache-Control') === 'no-store', 'Errors must be displayable and uncached.');
    check($app->handle($factory->createServerRequest('GET', 'https://demo.test/api/export', [
        'REMOTE_ADDR' => '192.0.2.1',
    ]))->getStatusCode() === 200, 'Quota must not block export polling.');
    check($app->handle($factory->createServerRequest('POST', 'https://demo.test/api/deeplink', [
        'REMOTE_ADDR' => '::ffff:192.0.2.1',
    ]))->getStatusCode() === 429, 'Mapped IPv4 addresses must share quota.');
    check($app->handle($factory->createServerRequest('POST', 'https://demo.test/api/deeplink', [
        'REMOTE_ADDR' => '192.0.2.2',
    ]))->getStatusCode() === 200, 'Another IP must retain its own quota.');

    // Invalid state and missing identity must fail closed, never erase history.
    file_put_contents($directory . '/http/creation.json', 'broken');
    check($app->handle($request)->getStatusCode() === 503, 'Corrupt storage must block creation.');
    check(file_get_contents($directory . '/http/creation.json') === 'broken', 'Corrupt state must not silently reset.');
    check($app->handle($factory->createServerRequest('POST', 'https://demo.test/api/deeplink'))
        ->getStatusCode() === 503, 'Missing identity must block creation.');

    // Force an unwritable storage path, including when tests run as root.
    file_put_contents($directory . '/not-a-directory', '');
    try {
        (new CreationRateLimiter($directory . '/not-a-directory/child'))->consume('visitor');
        throw new LogicException('Unavailable storage was accepted.');
    } catch (RuntimeException $exception) {
        check($exception->getMessage() === 'Unable to create rate-limit storage.', 'Expected a storage failure.');
    }

    // Independent PHP workers compete for the same persisted quota.
    $workers = [];
    for ($i = 0; $i < 30; $i++) {
        $process = proc_open([PHP_BINARY, __FILE__, 'worker', $directory . '/parallel'], [
            0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w'],
        ], $pipes);
        check(is_resource($process), 'Unable to start concurrency worker.');
        fclose($pipes[0]);
        $workers[] = [$process, $pipes];
    }
    $allowed = 0;
    foreach ($workers as [$process, $pipes]) {
        $output = stream_get_contents($pipes[1]);
        $errors = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        check(proc_close($process) === 0, 'Concurrency worker failed: ' . $errors);
        check(in_array($output, ['0', '86400'], true), 'Unexpected worker result.');
        $allowed += $output === '0' ? 1 : 0;
    }
    check($allowed === 20, 'Exactly 20 of 30 concurrent requests must pass.');

    // Run the actual front controller in an isolated installation with dummy
    // credentials. No invitation can reach the upstream API once quota is full.
    $fixture = $directory . '/app';
    mkdir($fixture . '/public', 0700, true);
    mkdir($fixture . '/config', 0700);
    copy(__DIR__ . '/../public/index.php', $fixture . '/public/index.php');
    symlink(realpath(__DIR__ . '/../vendor'), $fixture . '/vendor');
    file_put_contents($fixture . '/config/app.ini', implode("\n", [
        'api_base_url = "http://127.0.0.1:1"',
        'web_base_url = "https://demo.test"',
        'site_code = "test"',
        'api_key = "test"',
        'deeplink_secret = "test"',
    ]));
    $runner = <<<'PHP'
$_SERVER = [
    'REQUEST_METHOD' => 'POST', 'REQUEST_URI' => '/api/' . $argv[2],
    'SCRIPT_NAME' => '/index.php', 'SERVER_NAME' => 'demo.test',
    'SERVER_PORT' => 80, 'REMOTE_ADDR' => '192.0.2.10',
    'CONTENT_TYPE' => 'application/x-www-form-urlencoded',
];
$_POST = ['customer_no' => $argv[3], 'flow' => $argv[4]];
require $argv[1] . '/public/index.php';
echo "\n", http_response_code();
PHP;
    for ($i = 0; $i < 22; $i++) {
        $endpoint = $i === 20 ? 'invitation' : 'deeplink';
        $process = proc_open([
            PHP_BINARY, '-r', $runner, $fixture, $endpoint, 'customer-' . $i,
            $i % 2 ? 'deeplink-iframe' : 'deeplink',
        ], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        check(is_resource($process), 'Unable to start front controller.');
        fclose($pipes[0]);
        $output = stream_get_contents($pipes[1]);
        $errors = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        check(proc_close($process) === 0, 'Front controller failed: ' . $errors);
        $expectedStatus = $i < 20 ? 200 : 429;
        check(str_ends_with($output, "\n" . $expectedStatus), 'Wrong front-controller response: ' . $output);
        if ($i < 20) {
            check(str_contains($output, 'deeplink_url'), 'Allowed request must return a signed deeplink.');
        }
    }

    echo "Creation rate-limit checks passed.\n";
} finally {
    removeDirectory($directory);
}
