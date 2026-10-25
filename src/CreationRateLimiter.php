<?php

declare(strict_types=1);

namespace App;

use RuntimeException;

final class CreationRateLimiter
{
    public const LIMIT = 20;
    public const WINDOW_SECONDS = 86400;

    public function __construct(private readonly string $directory)
    {
    }

    /** Reserve an attempt atomically; return seconds until retry, or zero if allowed. */
    public function consume(string $identity, ?int $now = null): int
    {
        if (!is_dir($this->directory)
            && !@mkdir($this->directory, 0700, true)
            && !is_dir($this->directory)) {
            throw new RuntimeException('Unable to create rate-limit storage.');
        }

        // Keep the lock file separate: atomic replacement must not replace the lock.
        $lock = @fopen($this->directory . '/creation.lock', 'c');
        if ($lock === false) {
            throw new RuntimeException('Unable to open rate-limit lock.');
        }

        $temporaryPath = null;
        try {
            if (!flock($lock, LOCK_EX)) {
                throw new RuntimeException('Unable to acquire rate-limit lock.');
            }

            $now ??= time();
            $path = $this->directory . '/creation.json';
            $entries = [];
            if (file_exists($path)) {
                $json = @file_get_contents($path);
                if ($json === false) {
                    throw new RuntimeException('Unable to read rate-limit storage.');
                }
                $entries = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
                if (!is_array($entries)) {
                    throw new RuntimeException('Invalid rate-limit storage.');
                }
            }

            foreach ($entries as $key => $timestamps) {
                if (!is_array($timestamps)) {
                    throw new RuntimeException('Invalid rate-limit timestamps.');
                }
                foreach ($timestamps as $timestamp) {
                    if (!is_int($timestamp)) {
                        throw new RuntimeException('Invalid rate-limit timestamp.');
                    }
                }
                $entries[$key] = array_values(array_filter(
                    $timestamps,
                    static fn (int $timestamp): bool => $timestamp > $now - self::WINDOW_SECONDS
                ));
                if ($entries[$key] === []) {
                    unset($entries[$key]);
                }
            }

            $timestamps = $entries[$identity] ?? [];
            if (count($timestamps) >= self::LIMIT) {
                return max(1, min($timestamps) + self::WINDOW_SECONDS - $now);
            }

            $timestamps[] = $now;
            $entries[$identity] = $timestamps;
            $json = json_encode($entries, JSON_THROW_ON_ERROR);
            $temporaryPath = @tempnam($this->directory, 'creation-');
            if ($temporaryPath === false) {
                throw new RuntimeException('Unable to create rate-limit snapshot.');
            }
            if (@file_put_contents($temporaryPath, $json) !== strlen($json)
                || !@rename($temporaryPath, $path)) {
                throw new RuntimeException('Unable to save rate-limit storage.');
            }
            $temporaryPath = null;

            return 0;
        } finally {
            if (is_string($temporaryPath)) {
                @unlink($temporaryPath);
            }
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }
}
