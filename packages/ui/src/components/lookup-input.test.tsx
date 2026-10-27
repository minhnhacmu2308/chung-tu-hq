import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { Field } from "./field.js";
import { LookupInput } from "./inputs.js";

describe("LookupInput", () => {
  it("ô nhập có nhãn + nút tra cứu trong viền ô; bấm nút gọi onLookup, không submit form", async () => {
    const onLookup = vi.fn();
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    const { container } = render(
      <form onSubmit={onSubmit}>
        <Field label="Mã cảng"><LookupInput className="w-full" defaultValue="VNSGN" onLookup={onLookup} lookupLabel="Tra cứu Mã cảng" /></Field>
      </form>,
    );
    expect(screen.getByLabelText("Mã cảng")).toHaveValue("VNSGN");
    await userEvent.click(screen.getByRole("button", { name: "Tra cứu Mã cảng" }));
    expect(onLookup).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it("disabled thì nút tra cứu cũng tắt", () => {
    render(<LookupInput aria-label="Mã" disabled onLookup={() => undefined} lookupLabel="Tra cứu" />);
    expect(screen.getByRole("button", { name: "Tra cứu" })).toBeDisabled();
  });
});
