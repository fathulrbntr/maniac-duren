import { escape as e } from "./core.mjs";

export function accountProfile(state) {
  const person =
    state.employees?.find((employee) => employee.id === state.me?.id) || state.me || {};
  const accountName = person.name || "Akun login";
  const photo = person.profile_photo || state.me?.profile_photo;
  const role =
    {
      owner: "Owner · Akses penuh",
      manager: "Manager",
      cashier: "Kasir",
      admin: "Admin Back Office",
      waitress: "Waitress",
      cutter: "Tukang Potong",
      kitchen: "Kitchen",
      warehouse: "Gudang",
      staff: "Staff",
    }[person.role] || "Staff";
  const initials = accountName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  return `<div class="account-profile" aria-label="Akun yang login">${photo ? `<img src="${e(photo)}" alt="Foto ${e(accountName)}">` : `<span class="account-avatar" aria-hidden="true">${e(initials)}</span>`}<div><strong>${e(accountName)}</strong><span>${e(role)}</span></div></div>`;
}
