import { fileURLToPath } from 'node:url';
import * as SkillFilesystem from '@deepseek-ai/dsh-skill-filesystem';

/** Skill root shipped inside this package. */
const SKILLS_DIR = fileURLToPath(new URL('../skills', import.meta.url));

export const name = 'yy-skills';
export const inject = ['skills'];

/**
 * Mount the repository's canonical skills directory as an isolated DSH skill
 * provider, so bundled skills do not shadow or duplicate the built-in roots.
 */
export function apply(ctx) {
  ctx.plugin(SkillFilesystem, {
    providerName: 'yy-skills',
    includeDefaultRoots: false,
    customSkillDirs: [SKILLS_DIR],
    watch: true,
  });
}
