import {
  buildPromptIncludeTransientSection,
  PROMPT_INCLUDE_TRANSIENT_KEY
} from "/mod/_core/promptinclude/promptinclude.js";

export default async function injectPromptIncludeTransientSection(hookContext) {
  const promptContext = hookContext?.result;

  if (!promptContext || !Array.isArray(promptContext.sections)) {
    return;
  }

  const promptIncludeTransientSection = await buildPromptIncludeTransientSection().catch((error) => {
    console.error("Unable to build prompt include transient section.", error);
    return null;
  });

  if (!promptIncludeTransientSection) {
    return;
  }

  promptContext.promptIncludeTransientSection = promptIncludeTransientSection;
  promptContext.sections = promptContext.sections
    .filter((section) => String(section?.key || "").trim() !== PROMPT_INCLUDE_TRANSIENT_KEY)
    .concat(promptIncludeTransientSection);
}
