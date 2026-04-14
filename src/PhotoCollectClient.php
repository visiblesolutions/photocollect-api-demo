<?php

declare(strict_types=1);

namespace App;

use GuzzleHttp\Client;
use GuzzleHttp\ClientInterface;
use GuzzleHttp\Exception\GuzzleException;
use JsonException;
use RuntimeException;

final class PhotoCollectClient
{
    private readonly ClientInterface $httpClient;

    public function __construct(
        private readonly string $apiBaseUrl,
        private readonly string $webBaseUrl,
        private readonly string $siteCode,
        private readonly string $apiKey,
        private readonly string $deeplinkSecret,
        ?ClientInterface $httpClient = null,
    ) {
        $this->httpClient = $httpClient ?? new Client([
            'base_uri' => rtrim($this->apiBaseUrl, '/') . '/',
            'timeout' => 20,
            'connect_timeout' => 10,
            'http_errors' => false,
        ]);
    }

    public function createDeeplink(
        string $customerNo,
        ?string $locale = null,
        ?array $config = null,
    ): string
    {
        $customerNo = trim($customerNo);
        $siteCode = $this->resolveSiteCode();
        $locale = trim((string) $locale);

        if (empty($locale)) {
            $locale = 'en_US';
        }

        if (empty($customerNo)) {
            throw new RuntimeException('A customer_no value is required to generate a deeplink.');
        }

        $salt = (string) time();
        $payload = [
            'customer_no' => $customerNo,
            'site_code' => $siteCode,
            'salt' => $salt,
            'expiry_date' => date('Y-m-d', strtotime('+1 day')),
            'config' => (empty($config) ? null : $this->normalizeDeeplinkConfig($config))
        ];

        try {
            $payloadJson = json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
        } catch (JsonException $exception) {
            throw new RuntimeException('Unable to encode the deeplink payload.', 0, $exception);
        }

        //As we use HEX as the output from hash_hmac, no base64_encode is required
        $signature = hash_hmac('sha256', $payloadJson, $this->deeplinkSecret);

        return rtrim($this->webBaseUrl, '/') . '/collect/new?'
                . 'payload=' . rawurlencode(base64_encode($payloadJson))
                . '&sig=' . rawurlencode($signature)
                . '&locale=' . rawurlencode($locale);
    }

    public function createInvitation(
        string $customerNo,
        ?string $locale = null,
        ?array $config = null,
    ): array
    {
        $customerNo = trim($customerNo);
        $siteCode = $this->resolveSiteCode();
        $locale = trim((string) $locale);
        $invitationConfig = $this->normalizeInvitationConfig($config);
        if ($locale === '') {
            $locale = 'en_US';
        }

        if ($customerNo === '') {
            throw new RuntimeException('A customer_no value is required to create an invitation.');
        }

        $payload = [
            'customer_no' => $customerNo,
            'site_code' => $siteCode,
            'locale' => $locale,
            'upload_channel' => 'registration',
        ];

        if ($invitationConfig !== []) {
            $payload['config'] = $invitationConfig;
        }

        $response = $this->request(
            method: 'POST',
            path: '/invitation',
            body: $payload,
        );

        $invitationUrl = (string) ($response['invitation_url'] ?? '');
        if ($invitationUrl === '') {
            throw new RuntimeException('Photo Collect did not return an invitation_url.');
        }

        return [
            'customer_no' => $customerNo,
            'site_code' => $siteCode,
            'invitation_key' => (string) ($response['invitation_key'] ?? ''),
            'invitation_url' => $invitationUrl,
            'raw_response' => $response,
        ];
    }

    public function fetchLatestExport(string $customerNo): array
    {
        $customerNo = trim($customerNo);
        $siteCode = $this->resolveSiteCode();

        if ($customerNo === '') {
            throw new RuntimeException('A customer_no value is required to fetch exports.');
        }

        $response = $this->request(
            method: 'GET',
            path: '/export',
            query: [
                'customer_no' => $customerNo,
                'site_code' => $siteCode,
                'page_size' => 10,
            ],
        );

        $files = $response['files'] ?? [];
        if (!is_array($files) || $files === []) {
            return [
                'status' => 'pending',
                'customer_no' => $customerNo,
                'site_code' => $siteCode,
                'message' => 'No exported photo is available yet.',
            ];
        }

        usort($files, static function (array $left, array $right): int {
            $leftTimestamp = (string) ($left['uploaded_at'] ?? $left['exported_at'] ?? '');
            $rightTimestamp = (string) ($right['uploaded_at'] ?? $right['exported_at'] ?? '');

            return strcmp($leftTimestamp, $rightTimestamp);
        });

        $file = array_pop($files);
        if (!is_array($file) || empty($file['file_content'])) {
            return [
                'status' => 'pending',
                'customer_no' => $customerNo,
                'site_code' => $siteCode,
                'message' => 'The export is listed, but file content is not available yet.',
            ];
        }

        $mimeType = (string) ($file['file_type'] ?? 'image/jpeg');
        $deleteResult = null;
        $deleteWarning = null;
        $invitationKey = trim((string) ($file['invitation_key'] ?? ''));

        if ($invitationKey !== '') {
            try {
                $deleteResult = $this->deleteExport($invitationKey);
            } catch (RuntimeException $exception) {
                $deleteWarning = $exception->getMessage();
            }
        }

        $payload = [
            'status' => 'ready',
            'customer_no' => $customerNo,
            'site_code' => $siteCode,
            'image_url' => sprintf('data:%s;base64,%s', $mimeType, $file['file_content']),
            'file' => $file,
        ];

        if ($deleteResult !== null) {
            $payload['delete_result'] = $deleteResult;
        }

        if ($deleteWarning !== null) {
            $payload['delete_warning'] = $deleteWarning;
        }

        return $payload;
    }

    private function resolveSiteCode(): string
    {
        return $this->siteCode;
    }

    private function normalizeInvitationConfig(?array $config): array
    {
        return $this->normalizeConfigValues($config);
    }

    private function normalizeDeeplinkConfig(?array $config): array
    {
        $normalizedConfig = $this->normalizeConfigValues($config);
        $deeplinkConfig = [];

        foreach ($normalizedConfig as $key => $value) {
            $deeplinkConfig[$key] = $this->stringifyDeeplinkConfigValue($value);
        }

        ksort($deeplinkConfig);

        return $deeplinkConfig;
    }

    private function normalizeConfigValues(?array $config): array
    {
        if ($config === null) {
            return [];
        }

        $normalizedConfig = [];
        foreach ($config as $key => $value) {
            $normalizedKey = trim((string) $key);
            if ($normalizedKey === '' || $value === null) {
                continue;
            }

            if (!is_scalar($value) && !is_bool($value)) {
                throw new RuntimeException('Config values must be scalar.');
            }

            $normalizedConfig[$normalizedKey] = $value;
        }

        ksort($normalizedConfig);

        return $normalizedConfig;
    }

    private function stringifyDeeplinkConfigValue(mixed $value): string|bool
    {
        if (is_bool($value)) {
            return $value;
        }

        if (is_float($value)) {
            $normalized = rtrim(rtrim(sprintf('%.14F', $value), '0'), '.');

            return $normalized === '' ? '0' : $normalized;
        }

        return (string) $value;
    }

    private function deleteExport(string $invitationKey): array
    {
        $invitationKey = trim($invitationKey);

        if ($invitationKey === '') {
            throw new RuntimeException('An invitation_key is required to delete an exported photo.');
        }

        return $this->request(
            method: 'DELETE',
            path: '/export',
            query: [
                'invitation_key' => $invitationKey,
            ],
        );
    }

    private function request(string $method, string $path, array $query = [], ?array $body = null): array
    {
        $options = [
            'headers' => [
                'Accept' => 'application/json',
                'Authorization' => 'Custom ' . $this->apiKey,
                'X-Api-Key' => $this->apiKey,
            ],
            'query' => $query,
        ];

        if ($body !== null) {
            try {
                json_encode($body, JSON_THROW_ON_ERROR);
            } catch (JsonException $exception) {
                throw new RuntimeException('Unable to encode the upstream request body.', 0, $exception);
            }

            $options['json'] = $body;
        }

        try {
            $response = $this->httpClient->request(strtoupper($method), ltrim($path, '/'), $options);
        } catch (GuzzleException $exception) {
            throw new RuntimeException('The Photo Collect request failed.', 0, $exception);
        }

        $statusCode = $response->getStatusCode();
        $rawResponse = (string) $response->getBody();

        if ($rawResponse === '') {
            if ($statusCode >= 400) {
                throw new RuntimeException('Photo Collect returned an empty error response.');
            }

            return [];
        }

        try {
            $decoded = json_decode($rawResponse, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new RuntimeException('Photo Collect returned an invalid JSON response.', 0, $exception);
        }

        if ($statusCode >= 400) {
            $error = (string) ($decoded['error'] ?? ('Photo Collect returned HTTP ' . $statusCode . '.'));
            throw new RuntimeException($error);
        }

        if (!is_array($decoded)) {
            throw new RuntimeException('Photo Collect returned an unexpected response format.');
        }

        return $decoded;
    }
}
