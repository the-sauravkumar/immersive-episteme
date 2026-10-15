/**
 * Team, affiliations, ethics, contact and citation (src/config/institution.ts and
 * src/components/public/team-and-ethics.tsx): the values the project lead supplied, in citation
 * order, rendered by the same components on About and on the study's consent page; never a
 * personal email or phone number.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NO_INSTITUTION } from "@/components/public/institution-strip";
import { StudyTeamAndEthics, TeamList } from "@/components/public/team-and-ethics";
import { citationName, howToCite, INSTITUTION, institutionLines } from "@/config/institution";

describe("institution config", () => {
  it("lists the authors in citation order with their affiliations and Ankit Kumar's ORCID", () => {
    expect(INSTITUTION.authors.map((a) => [a.name, a.affiliations])).toEqual([
      ["Saurav Kumar", [1]],
      ["Ankit Kumar", [1]],
      ["Priyadarshi Patnaik", [1, 2]],
    ]);
    expect(INSTITUTION.authors.find((a) => a.name === "Ankit Kumar")?.orcid).toBe("0009-0009-1282-0309");
    expect(INSTITUTION.affiliations.map((f) => f.number)).toEqual([1, 2]);
    expect(INSTITUTION.ethicsReference).toMatch(/CXA\/ETH\/01/);
  });

  it("uses only the project's contact address, never a personal email or a phone number", () => {
    // ORCID iDs are identifiers, not phone numbers: left out of the phone check.
    const text = JSON.stringify({ ...INSTITUTION, authors: INSTITUTION.authors.map((a) => ({ ...a, orcid: null })) });
    expect(text.match(/[\w.+-]+@[\w.-]+/g)).toEqual(["cxa.craftecosystem@gmail.com"]);
    expect(text).not.toMatch(/\+?\d[\d\s-]{8,}\d/);
  });

  it("cites the platform until the paper is published, with no invented year", () => {
    expect(citationName("Priyadarshi Patnaik")).toBe("Patnaik, P.");
    const cite = howToCite(INSTITUTION)!;
    expect(cite.startsWith("Kumar, S., Kumar, A., and Patnaik, P. (n.d.). Immersive Episteme")).toBe(true);
    expect(howToCite({ ...INSTITUTION, paperCitation: "A paper." })).toBe("A paper.");
    expect(howToCite(NO_INSTITUTION)).toBeNull();
  });

  it("keeps the footer lines to the one-line fields", () => {
    expect(institutionLines().map((l) => l.key)).toEqual(["affiliation", "ethicsReference", "contact"]);
  });
});

describe("team and ethics components", () => {
  it("renders the authors with affiliation numbers and an ORCID link", () => {
    render(<TeamList institution={INSTITUTION} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "0009-0009-1282-0309" })).toHaveAttribute("href", "https://orcid.org/0009-0009-1282-0309");
  });

  it("shows the team, the ethics approval and the contact on the consent page block", () => {
    render(<StudyTeamAndEthics institution={INSTITUTION} />);
    expect(screen.getByRole("heading", { level: 2, name: "Research Team and Ethics" })).toBeInTheDocument();
    expect(screen.getByText(/Approval Number CXA\/ETH\/01/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "cxa.craftecosystem@gmail.com" })).toHaveAttribute("href", "mailto:cxa.craftecosystem@gmail.com");
  });

  it("renders nothing when nothing is configured", () => {
    const { container } = render(<StudyTeamAndEthics institution={NO_INSTITUTION} />);
    expect(container).toBeEmptyDOMElement();
  });
});
