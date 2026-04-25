import { redirect } from "next/navigation";

type CoursesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getFirstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CoursesPage({ searchParams }: CoursesPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const params = new URLSearchParams();
  const role = getFirstQueryValue(resolvedSearchParams.role);
  const name = getFirstQueryValue(resolvedSearchParams.name);

  if (role) {
    params.set("role", role);
  }

  if (name) {
    params.set("name", name);
  }

  redirect(params.size > 0 ? `/?${params.toString()}` : "/");
}
