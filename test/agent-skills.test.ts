import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateSkillName} from '../dist/core/agent/skills.js';
import {TOOL_GROUP_BY_NAME} from '../dist/mcp/deferred/tool-group-map.js';
import {
	AGENT_SKILLS_API_PATHS,
	AddSkillFromCatalogInputSchema,
	ListSkillsDataSchema,
} from '../dist/schemas/extended.js';

test('addSkillFromCatalog path and input', () => {
	assert.equal(AGENT_SKILLS_API_PATHS.addFromCatalog, '/addSkillFromCatalog');
	const parsed = AddSkillFromCatalogInputSchema.parse({
		name: 'continuum-dao-forum-inbox',
	});
	assert.equal(parsed.name, 'continuum-dao-forum-inbox');
	assert.equal(validateSkillName('continuum-dao-forum-inbox'), null);
});

test('listSkills schema keeps availableCatalog', () => {
	const parsed = ListSkillsDataSchema.parse({
		names: ['chart-defaults'],
		availableCatalog: [
			{
				name: 'continuum-dao-forum-inbox',
				initialLoad: false,
				format: 'md',
			},
		],
	});
	assert.equal(parsed.availableCatalog?.[0]?.name, 'continuum-dao-forum-inbox');
});

test('add_skill_from_catalog is mapped to agent_skills', () => {
	assert.equal(TOOL_GROUP_BY_NAME['add_skill_from_catalog'], 'agent_skills');
});
