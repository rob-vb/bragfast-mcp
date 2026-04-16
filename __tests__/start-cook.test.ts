import { describe, it, expect } from "vitest";
import { startCook, type WizardState } from "../src/tools/start-cook.js";

describe("startCook", () => {
  it("returns output_type step when state is empty", () => {
    const result = startCook({});
    expect(result.step).toBe("output_type");
    expect(result.choices).toEqual(["images", "video", "both"]);
    expect(result.collected).toEqual({});
  });

  it("defaults to empty state when called with no argument", () => {
    const result = startCook();
    expect(result.step).toBe("output_type");
  });

  it("advances to template after output_type", () => {
    const result = startCook({ output_type: "images" });
    expect(result.step).toBe("template");
    expect(result.collected.output_type).toBe("images");
  });

  it("advances to brand_or_colors after template", () => {
    const result = startCook({ output_type: "images", template: "hero" });
    expect(result.step).toBe("brand_or_colors");
  });

  it("advances past brand step when brand_id is set", () => {
    const result = startCook({
      output_type: "images",
      template: "hero",
      brand_id: "brand_123",
    });
    expect(result.step).toBe("visual");
  });

  it("advances past brand step when colors are set", () => {
    const result = startCook({
      output_type: "images",
      template: "hero",
      colors: { background: "#fff", text: "#000", primary: "#f80" },
    });
    expect(result.step).toBe("visual");
  });

  it("advances to content after visual", () => {
    const result = startCook({
      output_type: "images",
      template: "hero",
      brand_id: "brand_123",
      visual_url: "https://example.com/shot.png",
    });
    expect(result.step).toBe("content");
  });

  it("stays on content when only title is set", () => {
    const result = startCook({
      output_type: "images",
      template: "hero",
      brand_id: "brand_123",
      visual_url: "none",
      title: "Shipped",
    });
    expect(result.step).toBe("content");
  });

  it("advances to formats after title + description", () => {
    const result = startCook({
      output_type: "images",
      template: "hero",
      brand_id: "brand_123",
      visual_url: "none",
      title: "Shipped",
      description: "New release is out.",
    });
    expect(result.step).toBe("formats");
  });

  it("reaches ready for images path when all fields collected", () => {
    const state: WizardState = {
      output_type: "images",
      template: "hero",
      brand_id: "brand_123",
      visual_url: "https://example.com/shot.png",
      title: "Shipped",
      description: "New release is out.",
      formats: ["landscape"],
    };
    const result = startCook(state);
    expect(result.step).toBe("ready");
    expect(result.collected).toEqual(state);
  });

  it("requires video_preset for video path before ready", () => {
    const result = startCook({
      output_type: "video",
      template: "hero",
      brand_id: "brand_123",
      visual_url: "https://example.com/clip.mp4",
      title: "Shipped",
      description: "New release is out.",
      formats: ["landscape"],
    });
    expect(result.step).toBe("video_preset");
  });

  it("requires video_preset for both path before ready", () => {
    const result = startCook({
      output_type: "both",
      template: "hero",
      brand_id: "brand_123",
      visual_url: "https://example.com/clip.mp4",
      title: "Shipped",
      description: "New release is out.",
      formats: ["landscape", "portrait"],
    });
    expect(result.step).toBe("video_preset");
  });

  it("reaches ready for video path once preset is set", () => {
    const state: WizardState = {
      output_type: "video",
      template: "hero",
      brand_id: "brand_123",
      visual_url: "https://example.com/clip.mp4",
      title: "Shipped",
      description: "New release is out.",
      formats: ["landscape"],
      video_preset: "showcase",
    };
    const result = startCook(state);
    expect(result.step).toBe("ready");
    expect(result.collected).toEqual(state);
  });

  it("echoes collected state verbatim on every step", () => {
    const partial: WizardState = {
      output_type: "images",
      formats: ["landscape"],
      visual_url: "https://example.com/shot.png",
    };
    const result = startCook(partial);
    expect(result.collected).toEqual(partial);
    expect(result.step).toBe("template");
  });

  it("treats empty formats array the same as missing formats", () => {
    const result = startCook({
      output_type: "images",
      template: "hero",
      brand_id: "brand_123",
      visual_url: "none",
      title: "Shipped",
      description: "New release is out.",
      formats: [],
    });
    expect(result.step).toBe("formats");
  });
});
