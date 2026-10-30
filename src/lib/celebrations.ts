export type CelebrationKind = "birthday" | "anniversary";

export type Celebration = {
  employeeId: string;
  fullName: string;
  kind: CelebrationKind;
  /** Completed years at the company (anniversary) or age turning (birthday, null when unknown). */
  years: number | null;
};

export type CelebrationPerson = {
  employeeId: string;
  fullName: string;
  joiningDate: string | null;
  dateOfBirth: string | null;
};

function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Feb 29 dates are celebrated on Feb 28 in non-leap years. */
function fallsOn(dateIso: string, todayIso: string) {
  const [, month, day] = dateIso.split("-");
  const [year, todayMonth, todayDay] = todayIso.split("-");
  if (month === todayMonth && day === todayDay) return true;
  return (
    month === "02" &&
    day === "29" &&
    todayMonth === "02" &&
    todayDay === "28" &&
    !isLeapYear(Number(year))
  );
}

function yearsBetween(fromIso: string, todayIso: string) {
  return Number(todayIso.slice(0, 4)) - Number(fromIso.slice(0, 4));
}

export function celebrationsOn(people: CelebrationPerson[], todayIso: string): Celebration[] {
  const result: Celebration[] = [];
  for (const person of people) {
    if (person.dateOfBirth && fallsOn(person.dateOfBirth, todayIso)) {
      const age = yearsBetween(person.dateOfBirth, todayIso);
      result.push({
        employeeId: person.employeeId,
        fullName: person.fullName,
        kind: "birthday",
        years: age > 0 && age < 100 ? age : null,
      });
    }
    if (person.joiningDate && fallsOn(person.joiningDate, todayIso)) {
      const years = yearsBetween(person.joiningDate, todayIso);
      if (years >= 1) {
        result.push({
          employeeId: person.employeeId,
          fullName: person.fullName,
          kind: "anniversary",
          years,
        });
      }
    }
  }
  return result.sort((a, b) =>
    a.kind === b.kind ? a.fullName.localeCompare(b.fullName) : a.kind === "birthday" ? -1 : 1
  );
}

export function ordinal(value: number) {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

export function yearsLabel(years: number) {
  return `${years} ${years === 1 ? "year" : "years"}`;
}
