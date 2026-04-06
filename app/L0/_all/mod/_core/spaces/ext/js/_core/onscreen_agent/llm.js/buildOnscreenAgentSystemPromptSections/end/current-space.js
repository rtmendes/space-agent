import { SPACES_ROUTE_PATH } from "/mod/_core/spaces/constants.js";

function buildCurrentSpaceAgentInstructionsPromptSection(currentSpace) {
  const normalizedAgentInstructions = String(
    currentSpace?.agentInstructions ?? currentSpace?.specialInstructions ?? ""
  ).trim();

  if (!normalizedAgentInstructions) {
    return "";
  }

  return [
    "## Current Space Agent Instructions",
    "",
    normalizedAgentInstructions
  ].join("\n");
}

export default function injectCurrentSpacePromptSection(hookContext) {
  const promptContext = hookContext?.result;

  if (!promptContext || !Array.isArray(promptContext.sections)) {
    return;
  }

  if (globalThis.space?.router?.current?.path !== SPACES_ROUTE_PATH) {
    return;
  }

  const currentSpace = globalThis.space?.current;

  if (!currentSpace?.id) {
    return;
  }

  const currentSpaceAgentInstructionsPromptSection = buildCurrentSpaceAgentInstructionsPromptSection(currentSpace);
  const promptSections = [currentSpaceAgentInstructionsPromptSection].filter(Boolean);
  const sections = [...promptContext.sections];
  const skillsSectionIndex = promptContext.skillsSection ? sections.indexOf(promptContext.skillsSection) : -1;
  const insertIndex = skillsSectionIndex >= 0 ? skillsSectionIndex : sections.length;

  sections.splice(insertIndex, 0, ...promptSections);
  promptContext.currentSpaceAgentInstructionsPromptSection = currentSpaceAgentInstructionsPromptSection;
  promptContext.currentSpacePromptSection = "";
  promptContext.sections = sections;
}
