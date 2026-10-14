import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import OperatorFleetTab from '@/components/operator/OperatorFleetTab';
import OperatorTimetableTab from '@/components/operator/OperatorTimetableTab';

export default function AdminOperationsTab({ operators, routes }) {
  const [picked, setPicked] = useState('');
  const operator = operators.find((entry) => entry.slug === picked) || operators[0] || null;

  if (!operator) {
    return (
      <Card className="rounded-3xl border-border p-8 text-center text-sm text-muted-foreground shadow-sm">
        Add an operator first — fleet and departures are managed per company.
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="rounded-3xl border-border p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Company</p>
        <Select value={operator.slug} onValueChange={setPicked}>
          <SelectTrigger className="mt-2 w-full sm:w-80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {operators.map((entry) => (
              <SelectItem key={entry.slug} value={entry.slug}>
                {entry.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      <Tabs defaultValue="fleet">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="fleet">Fleet &amp; buses</TabsTrigger>
          <TabsTrigger value="timetable">Departures &amp; fares</TabsTrigger>
        </TabsList>
        <TabsContent value="fleet" className="mt-4">
          <OperatorFleetTab operator={operator} />
        </TabsContent>
        <TabsContent value="timetable" className="mt-4">
          <OperatorTimetableTab operator={operator} routes={routes} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
