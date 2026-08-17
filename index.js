/**
 * dsh-astrbotskill — AstrBot 插件开发教程总结技能插件。
 *
 * 唯一职责：把 skills/astrbot-plugin-dev/SKILL.md（AstrBot 插件开发教程全量总结）
 * 注册为 DSH 技能，供 agent 在开发/移植 AstrBot 插件时加载使用。
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

/** 技能目录与 SKILL.md 路径（相对本插件包根目录）。 */
const SKILL_DIR = fileURLToPath(new URL('./skills/astrbot-plugin-dev', import.meta.url));
const SKILL_MD = join(SKILL_DIR, 'SKILL.md');
const PROVIDER_NAME = 'astrbotskill';

/** 最小 YAML frontmatter 读取器：够解析 name / description 即可。 */
function parseFrontmatter(text) {
    const src = text.replace(/\r\n/g, '\n');
    if (!src.startsWith('---'))
        return { fm: {}, body: text };
    const end = src.indexOf('\n---', 3);
    if (end === -1)
        return { fm: {}, body: text };
    const fmText = src.slice(3, end);
    const body = src.slice(end + 4);
    const fm = {};
    for (const line of fmText.split('\n')) {
        const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
        if (m)
            fm[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
    return { fm, body };
}

/** 读取并解析 SKILL.md，返回技能候选元数据与正文。 */
async function loadSkill() {
    const text = await readFile(SKILL_MD, 'utf8');
    const { fm, body } = parseFrontmatter(text);
    return {
        name: fm['name'] || 'astrbot-plugin-dev',
        description: fm['description'] || 'AstrBot 插件开发教程总结（docs.astrbot.app/dev/star）',
        body,
    };
}

const provider = {
    name: PROVIDER_NAME,
    list: async () => {
        try {
            const skill = await loadSkill();
            return [{
                name: skill.name,
                description: skill.description,
                invocation: { modelInvocable: true, userInvocable: true },
                provider: PROVIDER_NAME,
                source: 'bundled',
                resourceBase: { kind: 'directory', path: SKILL_DIR },
                rank: 0,
                locator: pathToFileURL(SKILL_MD),
            }];
        } catch {
            return [];
        }
    },
    get: async (candidate) => {
        const skill = await loadSkill();
        return {
            name: skill.name,
            description: skill.description,
            invocation: { modelInvocable: true, userInvocable: true },
            provider: PROVIDER_NAME,
            source: 'bundled',
            resourceBase: { kind: 'directory', path: SKILL_DIR },
            content: skill.body,
        };
    },
};

/** Cordis 插件名（与 cordis.patch.yml 的 id 一致）。 */
export const name = 'astrbotskill';
/** 需要的服务：技能注册器。 */
export const inject = ['skills'];

/** 插件入口：注册 astrbot-plugin-dev 技能提供者。 */
export function apply(ctx) {
    ctx.skills.registerProvider(() => provider);
    ctx.logger.info('[astrbotskill] AstrBot 插件开发教程技能已注册（astrbot-plugin-dev）');
}
