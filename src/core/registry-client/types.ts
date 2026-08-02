/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export type PackumentVersion = {
    name: string,
    version: string
};

export type Packument = {
    name: string,
    'dist-tags' : Record<string, string>,
    versions: Record<string, PackumentVersion>
};

export interface IRegistryClient {
    getPackument(name: string, options: { registry: string; token?: string }): Promise<Packument>;

    /**
     * Point a dist-tag of a package to an already published version.
     *
     * @throws {RegistryError} When the registry rejects the request.
     */
    putDistTag(name: string, tag: string, version: string, options: { registry: string; token?: string }): Promise<void>;
}
