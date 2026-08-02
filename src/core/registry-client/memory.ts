/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { RegistryError } from './error.ts';
import type { IRegistryClient, Packument } from './types.ts';

export class MemoryRegistryClient implements IRegistryClient {
    public distTags: Array<{
        name: string;
        tag: string;
        version: string
    }>;

    private readonly items: Map<string, Packument>;

    // ----------------------------------------------------

    constructor(items: Record<string, Packument> = {}) {
        this.distTags = [];
        this.items = new Map(Object.entries(items));
    }

    // ----------------------------------------------------

    async getPackument(name: string): Promise<Packument> {
        const packument = this.items.get(name);
        if (!packument) {
            throw new RegistryError(`Package not found: ${name}`, 404);
        }
        return packument;
    }

    async putDistTag(name: string, tag: string, version: string): Promise<void> {
        this.distTags.push({
            name,
            tag,
            version,
        });

        const packument = this.items.get(name);
        if (packument) {
            packument['dist-tags'][tag] = version;
        }
    }

    addPackument(name: string, packument: Packument): void {
        this.items.set(name, packument);
    }
}
