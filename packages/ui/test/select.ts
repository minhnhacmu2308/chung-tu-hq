import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/** Chọn một mục của <Select> (danh sách tự vẽ): mở nút rồi bấm mục có nhãn `label`. */
export async function chooseOption(trigger: HTMLElement, label: string | RegExp): Promise<void> {
  await userEvent.click(trigger);
  await userEvent.click(await screen.findByRole("option", { name: label }));
}
