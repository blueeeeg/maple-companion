import { describe, expect, it } from 'vitest';
import { buildManifest } from './updater-manifest.ts';

const BASE = 'https://github.com/blueeeeg/maple-companion/releases/download/v0.1.11';

describe('updater manifest', () => {
  const manifest = buildManifest({
    repo: 'blueeeeg/maple-companion',
    tag: 'v0.1.11',
    prefix: 'Maple.Companion.Online_',
    pubDate: '2026-11-02T00:00:00.000Z',
    sigs: {
      'Maple.Companion.Online_universal.app.tar.gz.sig': 'mac-sig',
      'Maple.Companion.Online_0.1.11_x64-setup.exe.sig': 'nsis-sig',
      'Maple.Companion.Online_0.1.11_x64_en-US.msi.sig': 'msi-sig',
      // 같은 릴리스의 보통 판 서명은 넣지 않는다
      'Maple.Companion_universal.app.tar.gz.sig': 'normal-sig',
      'Maple.Companion_0.1.11_x64-setup.exe.sig': 'normal-sig',
    },
  });

  it('latest.json 과 같은 모양이다', () => {
    expect(manifest.version).toBe('0.1.11');
    expect(manifest.notes).toBe('');
    expect(manifest.pub_date).toBe('2026-11-02T00:00:00.000Z');
    // v0.1.10 의 latest.json 키
    expect(Object.keys(manifest.platforms).sort()).toEqual([
      'darwin-aarch64',
      'darwin-aarch64-app',
      'darwin-x86_64',
      'darwin-x86_64-app',
      'windows-x86_64',
      'windows-x86_64-msi',
      'windows-x86_64-nsis',
    ]);
  });

  it('온라인 판 자산만 가리킨다', () => {
    expect(manifest.platforms['darwin-x86_64']).toEqual({ signature: 'mac-sig', url: `${BASE}/Maple.Companion.Online_universal.app.tar.gz` });
    expect(manifest.platforms['windows-x86_64']).toEqual({ signature: 'nsis-sig', url: `${BASE}/Maple.Companion.Online_0.1.11_x64-setup.exe` });
    expect(manifest.platforms['windows-x86_64-msi']).toEqual({ signature: 'msi-sig', url: `${BASE}/Maple.Companion.Online_0.1.11_x64_en-US.msi` });
    expect(JSON.stringify(manifest)).not.toContain('normal-sig');
  });

  it('한 플랫폼만 올라갔으면 그 플랫폼만 넣는다', () => {
    const macOnly = buildManifest({
      repo: 'r/r',
      tag: 'v1.0.0',
      prefix: 'Maple.Companion.Online_',
      pubDate: '',
      sigs: { 'Maple.Companion.Online_universal.app.tar.gz.sig': 's' },
    });
    expect(Object.keys(macOnly.platforms).every((key) => key.startsWith('darwin-'))).toBe(true);
  });
});
