# Releasing to the Curious Reader CMS

How to package, verify and upload a release. Requirements come from the container team's [third-party game spec](../third-party-game-spec.md); the package format is [DEVSPEC §10](specs/DEVSPEC.md#10-packaging-npm-run-package).

## What you need from Curious Learning

- The CMS server URL and a personal MCP token (`crmcp_…`, from the admin site's "MCP tokens" tab). "Upload only" scope is enough for everything up to promotion.
- Confirmation of the engine slug `syllables-drag-into-place` and the `sub_app_id` `syllables_drag_into_place`. **Both are permanent**: a reserved slug can never be renamed, deleted or reused.
- Confirmation that every language code you ship (today only `english`) is in the CMS language catalog.

## 1. Package and verify

```bash
npm run package
```

This runs every check, then writes `dist/` and `build/`. Next, run the [offline `file://` check](specs/TESTSPEC.md#offline-file-check-before-every-upload). Record the sha256 values from `dist/upload-manifest.json`.

## 2. Upload (MCP, `POST https://<server>/mcp`)

All ZIPs are well under 10 MB, so they go inline as `zipBase64` (`base64 -w0 <file>`). If a ZIP ever exceeds 10 MB, send it with `begin_upload` (with `totalSize`), sequential `upload_chunk` calls of 4–8 MB, and then pass `uploadId` and `sha256` instead of `zipBase64`.

1. **First release only: reserve the engine slug.** Call `list_engine_slugs` and make sure `syllables-drag-into-place` is not taken, then:

   ```json
   { "tool": "create_engine_slug", "arguments": { "slug": "syllables-drag-into-place", "confirmed": true } }
   ```

2. **Engine.** For the first release, `title`, `urlTemplate` and `hasCoreLevel` initialize the engine; later releases send only `engineSlug`, `filename`, the payload and `versionNotes`. The host in `urlTemplate` is used only when the game is served remotely. Only the `?cr_lang={lang}` query matters on devices.

   ```json
   {
     "tool": "upload_core_game",
     "arguments": {
       "engineSlug": "syllables-drag-into-place",
       "title": "Drag Into Place",
       "urlTemplate": "https://<game-host>/?cr_lang={lang}",
       "hasCoreLevel": false,
       "filename": "syllables-drag-into-place-core.zip",
       "zipBase64": "<base64 of dist/syllables-drag-into-place-core.zip>",
       "versionNotes": "<what changed>"
     }
   }
   ```

3. **Each language pack**, with its icon. There is no `bookSlug`, because this is a Layout A game.

   ```json
   {
     "tool": "upload_language_pack",
     "arguments": {
       "engineSlug": "syllables-drag-into-place",
       "langCode": "english",
       "filename": "syllables-drag-into-place-lang-english.zip",
       "zipBase64": "<base64 of dist/syllables-drag-into-place-lang-english.zip>",
       "iconBase64": "<base64 of dist/syllables-drag-into-place-lang-english.png>",
       "versionNotes": "<what changed>"
     }
   }
   ```

Keep the `id` of every uploaded item from the responses.

The REST endpoints and the admin UI (`https://<server>/admin`) are alternatives that use a Google sign-in instead of a token (spec §8.6).

## 3. Verify, promote, publish

1. `list_inventory`: the new items appear with status `development`.
2. `GET https://<server>/api/manifest?channel=development` lists the tile with `zips[]` = `core` and `lang-english`. Alternatively, ask Curious Learning to preview it in the admin player.
3. With the Curious Learning team, check it on a device: events appear in the diagnostic log, and there are zero `NETGUARD_BLOCK` entries.
4. `promote_content` once per item, engine first. This requires an "edit" token and is usually done by Curious Learning staff.
5. **Promotion is not delivery.** Ask Curious Learning staff to **Publish**; until they do, devices keep the previously published content.
