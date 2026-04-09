import {
  buildPromptIncludeSystemPromptSection,
  buildPromptIncludeSystemPromptSections
} from "/mod/_core/promptinclude/promptinclude.js";

export default async function injectPromptIncludeSystemPromptSection(hookContext) {
  const promptContext = hookContext?.result;

  if (!promptContext || !Array.isArray(promptContext.sections)) {
    return;
  }

  const sections = [...promptContext.sections];
  const skillsSectionIndex = promptContext.skillsSection ? sections.indexOf(promptContext.skillsSection) : -1;
  const insertIndex = skillsSectionIndex >= 0 ? skillsSectionIndex : sections.length;
  const promptIncludeSystemPromptSections = await buildPromptIncludeSystemPromptSections().catch((error) => {
    console.error("Unable to build prompt include system prompt sections.", error);
    return [buildPromptIncludeSystemPromptSection()];
  });

  if (!promptIncludeSystemPromptSections.length) {
    return;
  }

  sections.splice(insertIndex, 0, ...promptIncludeSystemPromptSections);
  promptContext.promptIncludeSystemPromptSection = promptIncludeSystemPromptSections[0] || "";
  promptContext.promptIncludeSystemPromptSections = [...promptIncludeSystemPromptSections];
  promptContext.sections = sections;
}
