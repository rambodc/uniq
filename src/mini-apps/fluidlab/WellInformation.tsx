import { Fragment, type ReactNode } from "react";
import { Building2, CalendarDays, FileText, MapPin } from "lucide-react";
import type { Well } from "./model";
export default function WellInformation({
  well,
  locationMap,
}: {
  well: Well;
  locationMap?: ReactNode;
}) {
  const facts = well.details?.facts || {};
  const sections = [
    {
      title: "Identity & location",
      icon: MapPin,
      fields: [
        ["name", "Reported well name"],
        ["location", "Location / UWI"],
        ["province", "Province"],
        ["formation", "Formation"],
        ["fieldName", "Field"],
        ["license", "License"],
        ["afe", "AFE"],
      ],
    },
    {
      title: "Operations",
      icon: Building2,
      fields: [
        ["operator", "Operator"],
        ["contractor", "Contractor"],
        ["contractorReportFor", "Contractor report for"],
        ["rigName", "Rig"],
        ["reportedTotalDepth", "Reported total depth"],
      ],
    },
    {
      title: "Dates",
      icon: CalendarDays,
      fields: [
        ["wellFileCreationDate", "File created"],
        ["spudDate", "Spud date"],
        ["releasedDate", "Released date"],
      ],
    },
    { title: "Notes", icon: FileText, fields: [["wellNotes", "Well notes"]] },
  ];
  return (
    <>
      {sections.map(({ title, icon: Icon, fields }) =>
        fields.some(([key]) => facts[key]?.value) ? (
          <Fragment key={title}>
            <section className="fl-card fl-well-information">
              <div className="fl-card-heading">
                <Icon aria-hidden="true" />
                <h2>{title}</h2>
              </div>
              <dl>
                {fields.map(([key, label]) =>
                  facts[key]?.value ? (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd
                        className={
                          [
                            "operator",
                            "formation",
                            "rigName",
                            "reportedTotalDepth",
                          ].includes(key)
                            ? "fl-emphasis"
                            : ""
                        }
                      >
                        {facts[key].value}
                        {facts[key].unit ? ` ${facts[key].unit}` : ""}
                      </dd>
                    </div>
                  ) : null,
                )}
              </dl>
            </section>
            {title === "Identity & location" && locationMap}
          </Fragment>
        ) : null,
      )}
    </>
  );
}
