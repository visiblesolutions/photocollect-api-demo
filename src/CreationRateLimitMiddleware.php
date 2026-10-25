<?php

declare(strict_types=1);

namespace App;

use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use RuntimeException;
use Throwable;

final class CreationRateLimitMiddleware implements MiddlewareInterface
{
    public function __construct(
        private readonly CreationRateLimiter $limiter,
        private readonly ResponseFactoryInterface $responseFactory,
        private readonly string $identitySecret,
    ) {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        try {
            // Customer numbers and cookies are user-controlled. Only trust the
            // connection address; proxy headers must be resolved by the web server.
            $address = $request->getServerParams()['REMOTE_ADDR'] ?? '';
            $packedAddress = is_string($address) ? @inet_pton($address) : false;
            if ($packedAddress === false) {
                throw new RuntimeException('Client address is unavailable.');
            }
            // Treat IPv4-mapped IPv6 addresses as the same IPv4 client.
            if (strlen($packedAddress) === 16
                && substr($packedAddress, 0, 12) === str_repeat("\0", 10) . "\xff\xff") {
                $packedAddress = substr($packedAddress, 12);
            }

            $retryAfter = $this->limiter->consume(hash_hmac('sha256', $packedAddress, $this->identitySecret));
        } catch (Throwable $exception) {
            error_log('Creation rate limiter: ' . $exception->getMessage());

            return $this->errorResponse(503, 'Link creation is temporarily unavailable. Please try again later.', 60);
        }

        if ($retryAfter > 0) {
            return $this->errorResponse(
                429,
                'You can create up to 20 invitations or deeplinks within 24 hours. Please try again later.',
                $retryAfter,
            );
        }

        // Reserve before invoking the handler so parallel requests and upstream
        // failures cannot bypass the guard. Failed attempts also use the quota.
        return $handler->handle($request);
    }

    private function errorResponse(int $status, string $message, int $retryAfter): ResponseInterface
    {
        $response = $this->responseFactory->createResponse($status)
            ->withHeader('Content-Type', 'application/json; charset=UTF-8')
            ->withHeader('Cache-Control', 'no-store')
            ->withHeader('Retry-After', (string) $retryAfter);
        $response->getBody()->write(json_encode([
            'error' => $message,
            'retry_after' => $retryAfter,
        ], JSON_THROW_ON_ERROR));

        return $response;
    }
}
