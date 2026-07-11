import { useAccounts } from '@/hooks/use-desk';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusChip } from '@/components/status-chip';
import { Users, Plus, Trash2, Database, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";

export default function Accounts() {
  const { accounts, isLoading, addAccount, deleteAccount } = useAccounts();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newName) return;

    addAccount.mutate(
      { data: { email: newEmail, name: newName } },
      {
        onSuccess: () => {
          setIsAddOpen(false);
          setNewEmail("");
          setNewName("");
        }
      }
    );
  };

  return (
    <div className="p-8 max-w-7xl mx-auto w-full space-y-6 animate-in fade-in duration-500 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-mono font-bold tracking-tight text-white mb-2 uppercase flex items-center gap-3">
            <Users className="w-6 h-6 text-primary" />
            Target Directory
          </h2>
          <p className="text-muted-foreground font-mono text-sm">Manage automation targets and credentials.</p>
        </div>

        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button className="font-mono tracking-wider bg-primary hover:bg-primary/90 text-primary-foreground">
              <Plus className="w-4 h-4 mr-2" />
              Register Target
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-panel border-primary/30 sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="font-mono uppercase tracking-wider text-primary flex items-center gap-2">
                <Database className="w-4 h-4" />
                New Target Registration
              </DialogTitle>
              <DialogDescription className="font-mono text-xs">
                Enter target credentials for the automation pool.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="font-mono text-xs uppercase text-muted-foreground">Alias Identifier</Label>
                <Input 
                  id="name" 
                  value={newName} 
                  onChange={(e) => setNewName(e.target.value)} 
                  placeholder="e.g. Primary Account" 
                  className="bg-black/50 border-border/50 font-mono focus-visible:ring-primary focus-visible:border-primary"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="font-mono text-xs uppercase text-muted-foreground">Microsoft Email</Label>
                <Input 
                  id="email" 
                  type="email" 
                  value={newEmail} 
                  onChange={(e) => setNewEmail(e.target.value)} 
                  placeholder="user@outlook.com" 
                  className="bg-black/50 border-border/50 font-mono focus-visible:ring-primary focus-visible:border-primary"
                  autoComplete="off"
                />
              </div>
              <DialogFooter className="pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsAddOpen(false)}
                  className="font-mono text-xs uppercase"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={addAccount.isPending || !newEmail || !newName}
                  className="font-mono text-xs uppercase bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {addAccount.isPending ? 'Registering...' : 'Register'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex-1 min-h-0 relative">
        <Card className="glass-panel border-border/50 absolute inset-0 overflow-hidden flex flex-col">
          <div className="grid grid-cols-12 gap-4 p-4 border-b border-border/50 bg-black/20 text-xs font-mono uppercase tracking-wider text-muted-foreground">
            <div className="col-span-3">Alias / Identity</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2 text-right">Points Yield</div>
            <div className="col-span-2 text-right">Searches</div>
            <div className="col-span-2">Last Sync</div>
            <div className="col-span-1 text-center">Action</div>
          </div>

          <div className="overflow-y-auto flex-1 p-2 space-y-2">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground font-mono">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                Fetching directory...
              </div>
            ) : accounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-4 p-8">
                <AlertCircle className="w-12 h-12 opacity-20" />
                <p className="font-mono text-sm uppercase tracking-widest opacity-50">Directory Empty</p>
              </div>
            ) : (
              accounts.map((account) => (
                <div 
                  key={account.id} 
                  className="grid grid-cols-12 gap-4 p-4 items-center rounded bg-white/5 border border-transparent hover:border-border transition-colors group"
                >
                  <div className="col-span-3 min-w-0">
                    <p className="font-bold text-sm text-white truncate">{account.name}</p>
                    <p className="font-mono text-xs text-muted-foreground truncate">{account.email}</p>
                  </div>
                  
                  <div className="col-span-2">
                    <StatusChip status={account.status} />
                  </div>
                  
                  <div className="col-span-2 text-right font-mono text-sm">
                    <div className="text-yellow-500">+{account.todayPoints}</div>
                    <div className="text-xs text-muted-foreground opacity-50">{account.totalPoints} total</div>
                  </div>
                  
                  <div className="col-span-2 text-right font-mono text-sm">
                    {account.searchesCompleted || 0} / 50
                  </div>
                  
                  <div className="col-span-2 font-mono text-xs text-muted-foreground">
                    {account.lastRun ? new Date(account.lastRun).toLocaleString(undefined, { 
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                    }) : 'Never'}
                  </div>
                  
                  <div className="col-span-1 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => deleteAccount.mutate({ id: account.id })}
                      disabled={deleteAccount.isPending}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive h-8 w-8"
                      title="Remove Target"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
