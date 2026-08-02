/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import hapic, { isClientError } from 'hapic';
import { REGISTRY_URL } from '../../constants.ts';
import { RegistryError } from './error.ts';
import type { IRegistryClient, Packument } from './types.ts';

export class HapicRegistryClient implements IRegistryClient {
    async getPackument(
        name: string,
        options: { registry: string; token?: string },
    ): Promise<Packument> {
        const headers: Record<string, any> = { ACCEPT: 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*' };

        if (options.token) {
            headers.AUTHORIZATION = `Bearer ${options.token}`;
        }

        try {
            const response = await hapic.get(
                new URL(this.encodeName(name), options.registry || REGISTRY_URL).toString(),
                { headers },
            );

            return response.data;
        } catch (e) {
            if (isClientError(e)) {
                throw new RegistryError(e.message, e.statusCode || 500);
            }

            throw new RegistryError(`Registry request failed for ${name}`, 500);
        }
    }

    async putDistTag(
        name: string,
        tag: string,
        version: string,
        options: { registry: string; token?: string },
    ): Promise<void> {
        const path = `-/package/${this.encodeName(name)}/dist-tags/${encodeURIComponent(tag)}`;

        // The npm registry expects the version as a JSON encoded string body.
        const headers: Record<string, any> = { 'CONTENT-TYPE': 'application/json' };

        if (options.token) {
            headers.AUTHORIZATION = `Bearer ${options.token}`;
        }

        try {
            await hapic.put(
                new URL(path, options.registry || REGISTRY_URL).toString(),
                JSON.stringify(version),
                { headers },
            );
        } catch (e) {
            if (isClientError(e)) {
                throw new RegistryError(e.message, e.statusCode || 500);
            }

            throw new RegistryError(`Registry request failed for ${name}`, 500);
        }
    }

    // ----------------------------------------------------

    private encodeName(name: string): string {
        return encodeURIComponent(name)
            .replace(/^%40/, '@');
    }
}
