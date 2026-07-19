import { Link } from "react-router-dom";
import { Card, Badge, SectionLabel } from "@/components/scrb/primitives";
import { LanguageSelect } from "@/components/scrb/LanguageSelect";
import { Scale, ShieldCheck, Globe, ClipboardList, ArrowRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/lib/i18n";

export default function Settings() {
  const { user } = useAuth();
  const { t } = useI18n();

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8">
      <Card className="p-6 sm:p-8">
        <SectionLabel className="mb-2">{t("settings.label")}</SectionLabel>
        <h1 className="text-display text-3xl">{t("settings.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("settings.subtitle")}</p>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card accent="teal" className="p-6">
          <div className="flex items-center gap-2 border-b border-hairline pb-2 mb-4">
            <Globe className="h-4 w-4 text-teal" />
            <SectionLabel>{t("settings.language")}</SectionLabel>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{t("settings.languageHelp")}</p>
          <div className="mt-4 max-w-xs">
            <LanguageSelect />
          </div>
        </Card>

        <Card accent="amber" className="p-6">
          <div className="flex items-center gap-2 border-b border-hairline pb-2 mb-4">
            <Scale className="h-4 w-4 text-amber" />
            <SectionLabel>{t("settings.jurisdiction")}</SectionLabel>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{t("settings.jurisdictionHelp")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone="teal">{user?.districtName || user?.districtId || "District"}</Badge>
            <Badge tone="muted">{user?.stationName || user?.stationId || "Station"}</Badge>
            <Badge tone="amber">{user?.role || "OFFICER"}</Badge>
          </div>
        </Card>

        <Link to="/audit" className="lg:col-span-2">
          <Card accent="teal" className="p-6 flex items-center justify-between hover:bg-muted transition-colors">
            <div className="flex items-center gap-3">
              <ClipboardList className="h-5 w-5 text-teal" />
              <div>
                <SectionLabel>{t("settings.auditTrail")}</SectionLabel>
                <p className="mt-1 text-sm text-muted-foreground">{t("settings.auditHelp")}</p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </Card>
        </Link>

        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center gap-2 border-b border-hairline pb-2 mb-4">
            <ShieldCheck className="h-4 w-4 text-amber" />
            <SectionLabel>{t("settings.fairness")}</SectionLabel>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-foreground">
            SCRB Sahayak surfaces suggestions to support — never replace — an investigator&apos;s judgement. All AI-generated conclusions cite source records and expose a confidence score. No arrest, detention or coercive action may be initiated on an AI suggestion alone; human confirmation is required. Every query, source view and confirmation is written to an immutable audit log accessible to supervisory officers and oversight bodies.
          </p>
        </Card>
      </div>
    </div>
  );
}
