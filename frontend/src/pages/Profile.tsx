import { Card, Badge, SectionLabel } from "@/components/scrb/primitives";
import { ShieldCheck, MapPin } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/lib/i18n";

export default function Profile() {
  const { user } = useAuth();
  const { t } = useI18n();

  const officerName = user?.name || "Officer";
  const initials = officerName.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase();

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8">
      <Card className="p-6 sm:p-8 flex items-center gap-6">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-ink text-2xl font-bold text-white dark:bg-foreground dark:text-background">
          {initials}
        </div>
        <div>
          <SectionLabel className="mb-2">Officer Profile</SectionLabel>
          <h1 className="text-display text-3xl">{officerName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{user?.badgeId || "KA-00000"}</p>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card accent="teal" className="p-6">
          <div className="flex items-center gap-2 border-b border-hairline pb-2 mb-4">
            <ShieldCheck className="h-4 w-4 text-teal" />
            <SectionLabel>Role Information</SectionLabel>
          </div>
          <div className="space-y-4 mt-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Designation</span>
              <Badge tone="teal">{user?.role || "OFFICER"}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Badge ID</span>
              <span className="font-medium text-sm">{user?.badgeId || "KA-00000"}</span>
            </div>
          </div>
        </Card>

        <Card accent="amber" className="p-6">
          <div className="flex items-center gap-2 border-b border-hairline pb-2 mb-4">
            <MapPin className="h-4 w-4 text-amber" />
            <SectionLabel>Jurisdiction</SectionLabel>
          </div>
          <div className="space-y-4 mt-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">District</span>
              <span className="font-medium text-sm">{user?.districtName || user?.districtId || "District"}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Station</span>
              <span className="font-medium text-sm">{user?.stationName || user?.stationId || "Station"}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
